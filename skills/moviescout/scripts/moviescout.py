#!/usr/bin/env python3
"""
MovieScout - Radarr Movie Request Tool

Searches for movies via Radarr API, performs interactive search,
and grabs the highest quality release.
"""

import argparse
import json
import os
import sys
import re
from typing import Optional, Dict, List, Any
from urllib.parse import urljoin, quote

# Try to import requests, fall back to urllib if not available
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError


def get_env_or_exit(var_name: str) -> str:
    """Get environment variable or exit with error."""
    value = os.environ.get(var_name)
    if not value:
        print(f"Error: {var_name} environment variable is required", file=sys.stderr)
        sys.exit(1)
    return value


def make_request(url: str, headers: dict, method: str = "GET", data: dict = None) -> dict:
    """Make HTTP request and return JSON response."""
    if HAS_REQUESTS:
        if method == "GET":
            response = requests.get(url, headers=headers, json=data)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data)
        else:
            raise ValueError(f"Unsupported method: {method}")
        response.raise_for_status()
        return response.json()
    else:
        req = Request(url, headers=headers, method=method)
        if data:
            req.data = json.dumps(data).encode('utf-8')
            req.add_header('Content-Type', 'application/json')
        try:
            with urlopen(req) as response:
                return json.loads(response.read().decode('utf-8'))
        except HTTPError as e:
            print(f"HTTP Error: {e.code} - {e.reason}", file=sys.stderr)
            try:
                error_body = e.read().decode('utf-8')
                print(f"Response: {error_body}", file=sys.stderr)
            except:
                pass
            raise


def lookup_movie(radarr_url: str, api_key: str, term: str) -> List[dict]:
    """Search for movies by name/description."""
    headers = {"X-Api-Key": api_key}
    encoded_term = quote(term)
    url = f"{radarr_url}/api/v3/movie/lookup?term={encoded_term}"
    return make_request(url, headers)


def get_movie_details(radarr_url: str, api_key: str, movie_id: int) -> dict:
    """Get movie details by ID."""
    headers = {"X-Api-Key": api_key}
    url = f"{radarr_url}/api/v3/movie/{movie_id}"
    return make_request(url, headers)


def get_quality_profiles(radarr_url: str, api_key: str) -> List[dict]:
    """Get all quality profiles."""
    headers = {"X-Api-Key": api_key}
    url = f"{radarr_url}/api/v3/qualityprofile"
    return make_request(url, headers)


def interactive_search(radarr_url: str, api_key: str, movie_id: int) -> List[dict]:
    """Perform interactive search for a movie."""
    headers = {"X-Api-Key": api_key}
    url = f"{radarr_url}/api/v3/release?movieId={movie_id}"
    return make_request(url, headers)


def grab_release(radarr_url: str, api_key: str, release: dict) -> dict:
    """Grab a release."""
    headers = {"X-Api-Key": api_key}
    url = f"{radarr_url}/api/v3/release"
    payload = {
        "movieId": release.get("movieId"),
        "title": release.get("title"),
        "indexerId": release.get("indexerId"),
        "guid": release.get("guid"),
        "protocol": release.get("protocol"),
        "downloadProtocol": release.get("downloadProtocol"),
        "publishDate": release.get("publishDate"),
        "size": release.get("size"),
    }
    # Add optional fields if present
    for key in ["magnetUrl", "infoUrl", "downloadUrl", "seeders", "leechers"]:
        if key in release and release[key] is not None:
            payload[key] = release[key]
    
    return make_request(url, headers, method="POST", data=payload)


def parse_quality_info(title: str) -> Dict[str, Any]:
    """Parse quality info from release title."""
    title_lower = title.lower()
    
    # Resolution detection
    resolution = "Unknown"
    if re.search(r'\b2160p\b|\b4k\b|\buhd\b', title_lower):
        resolution = "2160p (4K)"
    elif re.search(r'\b1080p\b', title_lower):
        resolution = "1080p"
    elif re.search(r'\b720p\b', title_lower):
        resolution = "720p"
    elif re.search(r'\b480p\b', title_lower):
        resolution = "480p"
    
    # Dolby Vision detection
    dolby_vision = bool(re.search(r'dolby.?vision|dv|dovi', title_lower))
    
    # HDR detection (but not Dolby Vision)
    hdr = bool(re.search(r'\bhdr\b|\bhdr10\b|\bhdr10plus\b', title_lower)) and not dolby_vision
    
    # Audio quality detection
    audio = "Unknown"
    if re.search(r'\batmos\b', title_lower):
        audio = "Dolby Atmos"
    elif re.search(r'\btruehd\b|\btrue.?hd\b', title_lower):
        audio = "TrueHD"
    elif re.search(r'\bdts.?(hd|x)\b', title_lower):
        audio = "DTS-HD/X"
    elif re.search(r'\bdts\b', title_lower):
        audio = "DTS"
    elif re.search(r'\be.?ac3\b|\beac3\b', title_lower):
        audio = "E-AC3"
    elif re.search(r'\bac3\b', title_lower):
        audio = "AC3"
    elif re.search(r'\baac\b', title_lower):
        audio = "AAC"
    
    return {
        "resolution": resolution,
        "dolby_vision": dolby_vision,
        "hdr": hdr,
        "audio": audio
    }


def format_size(size_bytes: int) -> str:
    """Format bytes to human readable size."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} PB"


def is_4k_release(release: dict) -> bool:
    """Check if release is 4K/2160p based on quality or title."""
    quality = release.get("quality", {})
    quality_name = quality.get("quality", {}).get("name", "").lower()
    title = release.get("title", "").lower()
    
    # Check quality name
    if "2160p" in quality_name or "4k" in quality_name:
        return True
    
    # Check title
    if re.search(r'\b2160p\b|\b4k\b|\buhd\b', title):
        return True
    
    return False


def sort_releases(releases: List[dict], quality_profile: dict, prefer_4k: bool = True) -> List[dict]:
    """Sort releases by quality profile priority and custom format score.
    
    If prefer_4k is True, will prioritize 4K releases and only fall back to 1080p
    if no 4K releases are available.
    """
    # Build quality order map from profile
    quality_order = {}
    items = quality_profile.get("items", [])
    
    def extract_qualities(items_list, order=0):
        for item in items_list:
            if item.get("quality"):
                quality_order[item["quality"]["id"]] = order
                order += 1
            elif item.get("items"):
                order = extract_qualities(item["items"], order)
        return order
    
    extract_qualities(items)
    
    def get_sort_key(release):
        quality = release.get("quality", {})
        quality_id = quality.get("quality", {}).get("id", 9999)
        revision = quality.get("revision", {}).get("version", 1)
        custom_format_score = release.get("customFormatScore", 0)
        
        # Get quality priority (lower = better)
        quality_priority = quality_order.get(quality_id, 9999)
        
        # Sort by: custom format score (desc), quality priority (asc), revision (desc)
        return (-custom_format_score, quality_priority, -revision)
    
    sorted_releases = sorted(releases, key=get_sort_key)
    
    if not prefer_4k:
        return sorted_releases
    
    # Separate 4K and non-4K releases
    four_k_releases = [r for r in sorted_releases if is_4k_release(r)]
    other_releases = [r for r in sorted_releases if not is_4k_release(r)]
    
    # Return 4K first, then fall back to others
    if four_k_releases:
        return four_k_releases + other_releases
    else:
        return other_releases


def find_movie_in_radarr(radarr_url: str, api_key: str, tmdb_id: int) -> Optional[dict]:
    """Check if movie already exists in Radarr library."""
    headers = {"X-Api-Key": api_key}
    url = f"{radarr_url}/api/v3/movie"
    movies = make_request(url, headers)
    
    for movie in movies:
        if movie.get("tmdbId") == tmdb_id:
            return movie
    return None


def add_movie_to_radarr(radarr_url: str, api_key: str, movie: dict, quality_profile_id: int, root_folder: str) -> dict:
    """Add a new movie to Radarr."""
    headers = {"X-Api-Key": api_key}
    url = f"{radarr_url}/api/v3/movie"
    
    payload = {
        "title": movie.get("title"),
        "tmdbId": movie.get("tmdbId"),
        "year": movie.get("year"),
        "qualityProfileId": quality_profile_id,
        "rootFolderPath": root_folder,
        "monitored": True,
        "addOptions": {
            "searchForMovie": False,  # We'll search manually
            "monitor": "movieOnly"
        }
    }
    
    return make_request(url, headers, method="POST", data=payload)


def get_root_folders(radarr_url: str, api_key: str) -> List[dict]:
    """Get available root folders."""
    headers = {"X-Api-Key": api_key}
    url = f"{radarr_url}/api/v3/rootfolder"
    return make_request(url, headers)


def main():
    parser = argparse.ArgumentParser(description="Search and request movies via Radarr")
    parser.add_argument("query", help="Movie name or description to search for")
    parser.add_argument("--radarr-url", help="Radarr URL (or set RADARR_URL env var)")
    parser.add_argument("--api-key", help="Radarr API key (or set RADARR_API_KEY env var)")
    parser.add_argument("--quality-profile", type=int, help="Quality profile ID (auto-detected if not specified)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be grabbed without actually grabbing")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    parser.add_argument("--no-4k-preference", action="store_true", help="Don't prefer 4K releases (use Radarr's default ranking)")
    
    args = parser.parse_args()
    
    # Get configuration
    radarr_url = args.radarr_url or os.environ.get("RADARR_URL")
    api_key = args.api_key or os.environ.get("RADARR_API_KEY")
    
    if not radarr_url:
        print("Error: Radarr URL required (use --radarr-url or RADARR_URL env var)", file=sys.stderr)
        sys.exit(1)
    
    if not api_key:
        print("Error: API key required (use --api-key or RADARR_API_KEY env var)", file=sys.stderr)
        sys.exit(1)
    
    # Remove trailing slash from URL
    radarr_url = radarr_url.rstrip('/')
    
    try:
        # Step 1: Lookup movie
        print(f"🔍 Searching for: {args.query}")
        lookup_results = lookup_movie(radarr_url, api_key, args.query)
        
        if not lookup_results:
            print("❌ No movies found matching that query")
            sys.exit(1)
        
        # Take the first (best) match
        selected_movie = lookup_results[0]
        movie_title = selected_movie.get("title", "Unknown")
        movie_year = selected_movie.get("year", "Unknown")
        tmdb_id = selected_movie.get("tmdbId")
        
        print(f"📽️  Found: {movie_title} ({movie_year})")
        
        # Step 2: Check if movie exists in Radarr
        existing_movie = find_movie_in_radarr(radarr_url, api_key, tmdb_id)
        movie_id = None
        
        if existing_movie:
            movie_id = existing_movie.get("id")
            print(f"📚 Movie already in library (ID: {movie_id})")
            quality_profile_id = existing_movie.get("qualityProfileId")
        else:
            print("📚 Movie not in library, adding...")
            
            # Get default root folder
            root_folders = get_root_folders(radarr_url, api_key)
            if not root_folders:
                print("❌ No root folders configured in Radarr", file=sys.stderr)
                sys.exit(1)
            root_folder = root_folders[0].get("path")
            
            # Get quality profiles
            profiles = get_quality_profiles(radarr_url, api_key)
            if not profiles:
                print("❌ No quality profiles found in Radarr", file=sys.stderr)
                sys.exit(1)
            
            quality_profile_id = args.quality_profile or profiles[0].get("id")
            profile_name = next((p.get("name") for p in profiles if p.get("id") == quality_profile_id), "Unknown")
            print(f"   Quality profile: {profile_name} (ID: {quality_profile_id})")
            print(f"   Root folder: {root_folder}")
            
            # Add the movie
            if not args.dry_run:
                added = add_movie_to_radarr(radarr_url, api_key, selected_movie, quality_profile_id, root_folder)
                movie_id = added.get("id")
                print(f"✅ Added to library (ID: {movie_id})")
            else:
                print("   [Dry run - would add to library]")
                movie_id = 0  # Dummy ID for dry run
        
        if not movie_id:
            print("❌ Failed to get movie ID", file=sys.stderr)
            sys.exit(1)
        
        # Step 3: Perform interactive search
        print(f"\n🔎 Performing interactive search...")
        
        if args.dry_run and movie_id == 0:
            print("   [Dry run - skipping search]")
            sys.exit(0)
        
        releases = interactive_search(radarr_url, api_key, movie_id)
        
        if not releases:
            print("❌ No releases found")
            sys.exit(1)
        
        print(f"   Found {len(releases)} releases")
        
        # Get quality profile for sorting
        profiles = get_quality_profiles(radarr_url, api_key)
        quality_profile = next((p for p in profiles if p.get("id") == quality_profile_id), None)
        
        # Step 4: Sort and select best release
        prefer_4k = not args.no_4k_preference
        if quality_profile:
            sorted_releases = sort_releases(releases, quality_profile, prefer_4k=prefer_4k)
        else:
            # Fallback: sort by size (larger usually means higher quality)
            sorted_releases = sorted(releases, key=lambda r: r.get("size", 0), reverse=True)
        
        best_release = sorted_releases[0]
        is_fallback = prefer_4k and not is_4k_release(best_release)
        
        # Step 5: Parse and display quality info
        release_title = best_release.get("title", "Unknown")
        quality_info = parse_quality_info(release_title)
        size = format_size(best_release.get("size", 0))
        custom_score = best_release.get("customFormatScore", 0)
        indexer = best_release.get("indexer", "Unknown")
        protocol = best_release.get("protocol", "unknown").upper()
        
        # Build output
        output = {
            "movie": movie_title,
            "year": movie_year,
            "release_title": release_title,
            "resolution": quality_info["resolution"],
            "dolby_vision": quality_info["dolby_vision"],
            "hdr": quality_info["hdr"],
            "audio": quality_info["audio"],
            "size": size,
            "indexer": indexer,
            "protocol": protocol,
            "custom_format_score": custom_score
        }
        
        if args.json:
            print(json.dumps(output, indent=2))
        else:
            print("\n" + "="*60)
            print(f"🎬 {movie_title} ({movie_year})")
            print("="*60)
            print(f"📦 Release: {release_title}")
            print(f"📐 Resolution: {quality_info['resolution']}")
            
            video_format = []
            if quality_info["dolby_vision"]:
                video_format.append("Dolby Vision ✅")
            if quality_info["hdr"]:
                video_format.append("HDR ✅")
            if not video_format:
                video_format.append("SDR")
            print(f"🎨 Video: {' | '.join(video_format)}")
            
            print(f"🔊 Audio: {quality_info['audio']}")
            print(f"💾 Size: {size}")
            print(f"📡 Indexer: {indexer} ({protocol})")
            print(f"⭐ Custom Format Score: {custom_score}")
            print("="*60)
        
        # Step 6: Grab the release
        if not args.dry_run:
            if is_fallback:
                print(f"\n⚠️  No 4K releases found, falling back to 1080p")
            print(f"\n🎯 Grabbing release...")
            result = grab_release(radarr_url, api_key, best_release)
            print(f"✅ Successfully requested!")
            print(f"   Download will start shortly via {protocol}")
        else:
            if is_fallback:
                print(f"\n⚠️  No 4K releases found, would fall back to 1080p")
            print(f"\n🎯 [Dry run - would grab this release]")
        
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
