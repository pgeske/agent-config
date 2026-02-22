#!/usr/bin/env python3
"""
ShowScout - Request TV shows via Sonarr with interactive search.
Similar to MovieScout but for TV shows with season selection and season pack preference.
"""

import argparse
import json
import os
import re
import sys
import requests
from datetime import datetime


def parse_quality(title):
    """Parse quality info from release title."""
    title_lower = title.lower()
    
    # Resolution
    resolution = "Unknown"
    if any(x in title_lower for x in ['2160p', '4k', 'uhd']):
        resolution = "2160p (4K)"
    elif '1080p' in title_lower:
        resolution = "1080p"
    elif '720p' in title_lower:
        resolution = "720p"
    elif '480p' in title_lower:
        resolution = "480p"
    
    # Dolby Vision
    dv_patterns = ['dv', 'dovi', 'dolby vision', 'dolby.vision']
    has_dv = any(re.search(r'\b' + p + r'\b', title_lower) for p in dv_patterns)
    
    # HDR (but not if it's DV - we'll handle DV+HDR separately)
    hdr_patterns = ['hdr10', 'hdr10+', 'hdr ']
    has_hdr = any(re.search(r'\b' + p.replace('+', r'\+') + r'\b', title_lower) for p in hdr_patterns)
    
    # Audio
    audio = "Unknown"
    if 'atmos' in title_lower:
        audio = "Dolby Atmos"
    elif 'truehd' in title_lower:
        audio = "TrueHD"
    elif any(x in title_lower for x in ['dts-hd', 'dtshd']):
        audio = "DTS-HD"
    elif 'dtsx' in title_lower or 'dts-x' in title_lower:
        audio = "DTS:X"
    elif re.search(r'\bdts\b', title_lower):
        audio = "DTS"
    elif 'e-ac3' in title_lower or 'eac3' in title_lower:
        audio = "E-AC3"
    elif re.search(r'\bac3\b', title_lower):
        audio = "AC3"
    elif 'aac' in title_lower:
        audio = "AAC"
    
    return {
        'resolution': resolution,
        'dv': has_dv,
        'hdr': has_hdr,
        'audio': audio
    }


def is_season_pack(release, season_number):
    """
    Check if a release is a season pack for the given season.
    Season packs typically contain multiple or all episodes of a season.
    """
    title = release.get('releaseTitle', '').lower()
    
    # Check for season pack indicators in title
    season_patterns = [
        rf'\bs{season_number:02d}\b(?!e\d+)',  # S01 but not S01E01
        rf'\bseason[ .]?{season_number}\b',
        rf'\bs{season_number}\b(?!e\d+)',
    ]
    
    for pattern in season_patterns:
        if re.search(pattern, title):
            # Verify it's not a single episode (S01E01, etc.)
            if not re.search(rf'\bs{season_number:02d}e\d+', title):
                return True
    
    # Also check Sonarr's episode info if available
    episode_info = release.get('episodeNumbers', [])
    if episode_info and len(episode_info) > 1:
        return True
    
    return False


def get_episodes_for_season(sonarr_url, api_key, series_id, season_number):
    """Get all episodes for a specific season."""
    url = f"{sonarr_url}/api/v3/episode"
    headers = {'X-Api-Key': api_key}
    params = {
        'seriesId': series_id,
        'seasonNumber': season_number
    }
    
    response = requests.get(url, params=params, headers=headers)
    response.raise_for_status()
    return response.json()


def is_season_complete(episodes):
    """
    Check if a season is complete (all episodes have aired).
    Returns True if all episodes have an air date in the past.
    """
    if not episodes:
        return False
    
    now = datetime.now()
    
    for episode in episodes:
        # Skip special episodes (episode 0) which may not have regular scheduling
        if episode.get('episodeNumber') == 0:
            continue
            
        air_date_str = episode.get('airDateUtc')
        if not air_date_str:
            # If any regular episode has no air date, season is not complete
            if episode.get('episodeNumber', 0) > 0:
                return False
            continue
        
        try:
            # Parse ISO format date
            air_date = datetime.fromisoformat(air_date_str.replace('Z', '+00:00')).replace(tzinfo=None)
            if air_date > now:
                # Future episode = season not complete
                return False
        except (ValueError, AttributeError):
            # If we can't parse the date, assume episode hasn't aired
            return False
    
    return True


def format_size(size_mb):
    """Format size in GB with 1 decimal."""
    if size_mb is None:
        return "Unknown"
    return f"{size_mb / 1024:.1f} GB"


def lookup_series(sonarr_url, api_key, query):
    """Search for series by name."""
    url = f"{sonarr_url}/api/v3/series/lookup"
    params = {'term': query}
    headers = {'X-Api-Key': api_key}
    
    response = requests.get(url, params=params, headers=headers)
    response.raise_for_status()
    return response.json()


def get_series(sonarr_url, api_key, tvdb_id):
    """Check if series already exists in library."""
    url = f"{sonarr_url}/api/v3/series"
    headers = {'X-Api-Key': api_key}
    
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    series_list = response.json()
    
    for series in series_list:
        if series.get('tvdbId') == tvdb_id:
            return series
    return None


def add_series(sonarr_url, api_key, series_info, quality_profile_id, root_folder_path, seasons):
    """Add series to Sonarr with specified seasons."""
    url = f"{sonarr_url}/api/v3/series"
    headers = {
        'X-Api-Key': api_key,
        'Content-Type': 'application/json'
    }
    
    # Build seasons array
    seasons_data = []
    for season in series_info.get('seasons', []):
        season_num = season.get('seasonNumber')
        if seasons == 'all' or season_num in seasons:
            seasons_data.append({
                'seasonNumber': season_num,
                'monitored': True
            })
        else:
            seasons_data.append({
                'seasonNumber': season_num,
                'monitored': False
            })
    
    payload = {
        'tvdbId': series_info['tvdbId'],
        'title': series_info['title'],
        'qualityProfileId': quality_profile_id,
        'titleSlug': series_info.get('titleSlug', series_info['title'].lower().replace(' ', '-')),
        'rootFolderPath': root_folder_path,
        'seasons': seasons_data,
        'monitored': True,
        'seriesType': series_info.get('seriesType', 'standard'),
        'addOptions': {
            'ignoreEpisodesWithFiles': False,
            'ignoreEpisodesWithoutFiles': False,
            'monitor': 'none',  # We handle this via seasons array
            'searchForMissingEpisodes': True,
            'searchForCutoffUnmetEpisodes': False
        }
    }
    
    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    return response.json()


def update_series_seasons(sonarr_url, api_key, series_id, seasons):
    """Update which seasons are monitored."""
    url = f"{sonarr_url}/api/v3/series/{series_id}"
    headers = {
        'X-Api-Key': api_key,
        'Content-Type': 'application/json'
    }
    
    # Get current series data
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    series = response.json()
    
    # Update seasons
    for season in series.get('seasons', []):
        season_num = season.get('seasonNumber')
        if seasons == 'all' or season_num in seasons:
            season['monitored'] = True
        else:
            season['monitored'] = False
    
    # Trigger search for monitored seasons
    series['addOptions'] = {
        'searchForMissingEpisodes': True
    }
    
    response = requests.put(url, json=series, headers=headers)
    response.raise_for_status()
    return response.json()


def interactive_search(sonarr_url, api_key, series_id, season_number=None):
    """Perform interactive search for series/season."""
    url = f"{sonarr_url}/api/v3/release"
    headers = {'X-Api-Key': api_key}
    
    if season_number is not None:
        params = {
            'seriesId': series_id,
            'seasonNumber': season_number
        }
    else:
        params = {'seriesId': series_id}
    
    response = requests.get(url, params=params, headers=headers)
    response.raise_for_status()
    return response.json()


def grab_release(sonarr_url, api_key, release_guid, indexer_id):
    """Grab a specific release."""
    url = f"{sonarr_url}/api/v3/release"
    headers = {
        'X-Api-Key': api_key,
        'Content-Type': 'application/json'
    }
    
    payload = {
        'guid': release_guid,
        'indexerId': indexer_id
    }
    
    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    return response.json()


def sort_releases(releases, prefer_season_pack=False, season_number=None):
    """
    Sort releases by custom format score, quality, and revision.
    If prefer_season_pack is True, boost season packs to the top (after CF score).
    """
    def sort_key(release):
        cf_score = release.get('customFormatScore', 0)
        quality_order = release.get('quality', {}).get('quality', {}).get('id', 999)
        revision = release.get('releaseWeight', 0)
        
        # Season pack preference: give a moderate boost to season packs when preferred
        is_pack = is_season_pack(release, season_number) if season_number else False
        pack_boost = 1000 if (prefer_season_pack and is_pack) else 0
        
        # Sort order: CF score (desc), pack boost (desc), quality (asc), revision (desc)
        return (-cf_score, -pack_boost, quality_order, -revision)
    
    return sorted(releases, key=sort_key)


def main():
    parser = argparse.ArgumentParser(description='Request TV shows via Sonarr')
    parser.add_argument('query', help='Show name to search for')
    parser.add_argument('--seasons', help='Seasons to request (e.g., "1,2,3" or "all")', default=None)
    parser.add_argument('--quality-profile', type=int, help='Quality profile ID', default=10)
    parser.add_argument('--root-folder', help='Root folder path', default='/mnt/media/tv')
    parser.add_argument('--sonarr-url', help='Sonarr URL', default=os.getenv('SONARR_URL'))
    parser.add_argument('--api-key', help='Sonarr API key', default=os.getenv('SONARR_API_KEY'))
    parser.add_argument('--dry-run', action='store_true', help='Preview without grabbing')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    parser.add_argument('--prefer-season-pack', action='store_true', help='Prefer season packs for complete seasons (auto-detected)')
    
    args = parser.parse_args()
    
    if not args.sonarr_url:
        print("Error: SONARR_URL not set. Use --sonarr-url or set env var.")
        sys.exit(1)
    
    if not args.api_key:
        print("Error: SONARR_API_KEY not set. Use --api-key or set env var.")
        sys.exit(1)
    
    # Parse seasons if provided
    seasons = None
    if args.seasons:
        if args.seasons.lower() == 'all':
            seasons = 'all'
        else:
            try:
                seasons = [int(s.strip()) for s in args.seasons.split(',')]
            except ValueError:
                print("Error: Seasons must be comma-separated numbers or 'all'")
                sys.exit(1)
    
    # Lookup series
    print(f"🔍 Searching for: {args.query}")
    results = lookup_series(args.sonarr_url, args.api_key, args.query)
    
    if not results:
        print("❌ No results found")
        sys.exit(1)
    
    series = results[0]
    print(f"📺 Found: {series['title']} ({series.get('year', 'N/A')})")
    
    # Check if already in library
    existing = get_series(args.sonarr_url, args.api_key, series['tvdbId'])
    series_id = None
    
    if existing:
        print(f"ℹ️ Series already in library (ID: {existing['id']})")
        series_id = existing['id']
        
        # If seasons specified, update monitoring
        if seasons:
            update_series_seasons(args.sonarr_url, args.api_key, series_id, seasons)
            print(f"📂 Updated monitored seasons")
    else:
        # If no seasons specified, need to ask
        available_seasons = [s['seasonNumber'] for s in series.get('seasons', []) if s.get('seasonNumber', 0) > 0]
        
        if seasons is None:
            print(f"\n📋 Available seasons: {', '.join(map(str, available_seasons))}")
            print("❓ Which seasons do you want? (comma-separated numbers, or 'all')")
            print("   Example: 1,2,3  or  all")
            return  # Exit to let user specify
        
        # Add series
        print(f"➕ Adding to library...")
        result = add_series(args.sonarr_url, args.api_key, series, args.quality_profile, args.root_folder, seasons)
        series_id = result['id']
        print(f"✅ Added with ID: {series_id}")
    
    # Determine which seasons to check
    seasons_to_check = []
    if seasons == 'all':
        seasons_to_check = [s['seasonNumber'] for s in series.get('seasons', []) if s.get('seasonNumber', 0) > 0]
    elif seasons:
        seasons_to_check = seasons
    
    # Check season completion status for season pack preference
    season_pack_preference = {}
    if seasons_to_check:
        print(f"\n📊 Checking season status...")
        for season_num in seasons_to_check:
            try:
                episodes = get_episodes_for_season(args.sonarr_url, args.api_key, series_id, season_num)
                is_complete = is_season_complete(episodes)
                season_pack_preference[season_num] = is_complete
                
                status = "✅ Complete" if is_complete else "🔄 Ongoing"
                total_episodes = len([e for e in episodes if e.get('episodeNumber', 0) > 0])
                aired_episodes = len([e for e in episodes if e.get('episodeNumber', 0) > 0 and is_season_complete([e])])
                
                if is_complete:
                    print(f"   Season {season_num}: {status} ({total_episodes} episodes) - will prefer season packs")
                else:
                    print(f"   Season {season_num}: {status} - individual episodes OK")
            except Exception as e:
                print(f"   Season {season_num}: Could not check status ({e})")
                season_pack_preference[season_num] = False
    
    # Use first season's preference for now (simplified - could be enhanced for multi-season)
    prefer_season_pack = any(season_pack_preference.values()) if season_pack_preference else False
    first_season = seasons_to_check[0] if seasons_to_check else None
    
    # Perform interactive search
    print(f"\n🔎 Searching for releases...")
    if first_season:
        releases = interactive_search(args.sonarr_url, args.api_key, series_id, first_season)
    else:
        releases = interactive_search(args.sonarr_url, args.api_key, series_id)
    
    if not releases:
        print("❌ No releases found")
        sys.exit(1)
    
    # Sort releases with season pack preference
    sorted_releases = sort_releases(releases, prefer_season_pack, first_season)
    best_release = sorted_releases[0]
    
    # Parse quality
    quality = parse_quality(best_release.get('releaseTitle', ''))
    
    # Check if the selected release is a season pack
    selected_is_pack = is_season_pack(best_release, first_season) if first_season else False
    
    # Build output
    output = {
        'series': series['title'],
        'release': best_release.get('releaseTitle', 'Unknown'),
        'resolution': quality['resolution'],
        'dv': quality['dv'],
        'hdr': quality['hdr'] if not quality['dv'] else False,
        'audio': quality['audio'],
        'size': format_size(best_release.get('size')),
        'indexer': best_release.get('indexer', 'Unknown'),
        'custom_format_score': best_release.get('customFormatScore', 0),
        'is_season_pack': selected_is_pack,
        'season_complete': prefer_season_pack,
        'guid': best_release.get('guid'),
        'indexer_id': best_release.get('indexerId')
    }
    
    if args.json:
        print(json.dumps(output, indent=2))
    else:
        print("\n" + "="*60)
        print(f"📺 {output['series']}")
        print("="*60)
        print(f"📦 Release: {output['release'][:57]}{'...' if len(output['release']) > 57 else ''}")
        print(f"📦 Type: {'📁 Season Pack' if selected_is_pack else '🎬 Individual Episode(s)'}")
        print(f"📐 Resolution: {output['resolution']}")
        
        video_info = []
        if output['dv']:
            video_info.append("Dolby Vision ✅")
        if output['hdr']:
            video_info.append("HDR ✅")
        print(f"🎨 Video: {' | '.join(video_info) if video_info else 'SDR'}")
        
        print(f"🔊 Audio: {output['audio']}")
        print(f"💾 Size: {output['size']}")
        print(f"📡 Indexer: {output['indexer']}")
        print(f"⭐ Custom Format Score: {output['custom_format_score']}")
        print("="*60)
    
    if args.dry_run:
        print("\n🛑 Dry run - not grabbing")
        return
    
    # Grab the release
    print("\n🎯 Grabbing release...")
    try:
        grab_result = grab_release(
            args.sonarr_url,
            args.api_key,
            output['guid'],
            output['indexer_id']
        )
        
        if args.json:
            print(json.dumps(grab_result, indent=2))
        else:
            print("✅ Successfully requested!")
            print(f"   Download will start shortly via {output['indexer']}")
    
    except requests.exceptions.HTTPError as e:
        print(f"❌ Error grabbing release: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
