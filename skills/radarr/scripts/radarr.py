#!/usr/bin/env python3
"""
Radarr Skill - Interact with Radarr instance to manage movies.
Provides general Radarr integration with detailed metadata in responses.
"""

import argparse
import os
import re
import sys

import requests


LOCAL_CONFIG_PATH = os.path.expanduser("~/containers/radarr")


def get_env_value_from_zshenv(var_name):
    """Read an exported variable from ~/.zshenv."""
    zshenv_path = os.path.expanduser("~/.zshenv")
    if not os.path.exists(zshenv_path):
        return None

    pattern = re.compile(rf'export\s+{re.escape(var_name)}=["\']([^"\']+)["\']')
    with open(zshenv_path, "r", encoding="utf-8") as handle:
        for line in handle:
            match = pattern.search(line.strip())
            if match:
                return match.group(1)
    return None


def get_radarr_config():
    """Get Radarr configuration from environment or ~/.zshenv."""
    api_key = os.getenv("RADARR_API_KEY") or get_env_value_from_zshenv("RADARR_API_KEY")
    url = os.getenv("RADARR_URL") or get_env_value_from_zshenv("RADARR_URL") or "http://localhost:7878"

    if not api_key:
        print("❌ Error: RADARR_API_KEY not found in environment or .zshenv")
        print("   Please set RADARR_API_KEY in your shell config:")
        print('   export RADARR_API_KEY="your-api-key-here"')
        sys.exit(1)

    return {"url": url.rstrip("/"), "api_key": api_key}


def make_request(endpoint, method="GET", data=None, params=None):
    """Make an API request to Radarr."""
    config = get_radarr_config()
    url = f"{config['url']}/api/v3{endpoint}"
    headers = {"X-Api-Key": config["api_key"]}

    try:
        response = requests.request(
            method,
            url,
            headers=headers,
            json=data,
            params=params,
            timeout=30,
        )
        response.raise_for_status()
        if not response.content:
            return {}
        return response.json()
    except requests.exceptions.RequestException as exc:
        print(f"❌ API Error: {exc}")
        response = getattr(exc, "response", None)
        if response is not None:
            print(f"   Status: {response.status_code}")
            print(f"   Response: {response.text}")
        sys.exit(1)


def format_file_size(size_bytes):
    """Format file size in human-readable form."""
    if size_bytes is None:
        return "Unknown"

    size = float(size_bytes)
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024.0:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} PB"


def get_quality_profiles():
    """Fetch Radarr quality profiles."""
    return make_request("/qualityprofile")


def get_root_folders():
    """Fetch Radarr root folders."""
    return make_request("/rootfolder")


def get_movies():
    """Fetch Radarr library movies."""
    return make_request("/movie")


def find_movie_in_library(movie_name):
    """Find a movie in the Radarr library by exact or partial title."""
    movies = get_movies()
    movie_name_lower = movie_name.lower()

    exact = [movie for movie in movies if movie.get("title", "").lower() == movie_name_lower]
    if exact:
        return exact[0]

    partial = [movie for movie in movies if movie_name_lower in movie.get("title", "").lower()]
    if partial:
        return partial[0]

    return None


def lookup_movie(movie_name):
    """Look up a movie through the Radarr lookup endpoint."""
    return make_request("/movie/lookup", params={"term": movie_name})


def resolve_root_folder(path_override=None):
    """Choose a root folder."""
    if path_override:
        return path_override

    folders = get_root_folders()
    if not folders:
        print("❌ No root folders configured in Radarr")
        sys.exit(1)
    return folders[0].get("path")


def resolve_quality_profile(profile_id=None):
    """Choose a quality profile id and name."""
    profiles = get_quality_profiles()
    if not profiles:
        print("❌ No quality profiles configured in Radarr")
        sys.exit(1)

    if profile_id is not None:
        for profile in profiles:
            if profile.get("id") == profile_id:
                return profile_id, profile.get("name", "Unknown")
        print(f"❌ Quality profile ID {profile_id} not found")
        sys.exit(1)

    profile = profiles[0]
    return profile.get("id"), profile.get("name", "Unknown")


def format_movie_header(movie, quality_profile_name=None):
    """Print a standard movie header."""
    print("\n" + "=" * 60)
    print(f"🎬 {movie.get('title', 'Unknown')} ({movie.get('year', 'Unknown')})")
    print("=" * 60)
    print(f"📌 Movie ID: {movie.get('id', 'Unknown')}")
    print(f"📁 Path: {movie.get('path', 'Unknown')}")
    print(f"📦 Downloaded: {'✅ Yes' if movie.get('hasFile') else '❌ No'}")
    print(f"👁️  Monitored: {'✅ Yes' if movie.get('monitored') else '❌ No'}")
    print(f"🏷️  Status: {movie.get('status', 'Unknown')}")

    if movie.get("studio"):
        print(f"🏢 Studio: {movie['studio']}")
    if movie.get("runtime"):
        print(f"⏱️  Runtime: {movie['runtime']} min")
    if movie.get("genres"):
        print(f"🎭 Genres: {', '.join(movie['genres'])}")
    if quality_profile_name:
        print(f"🎯 Quality Profile: {quality_profile_name}")
    if movie.get("sizeOnDisk") is not None:
        print(f"💾 Size: {format_file_size(movie['sizeOnDisk'])}")


def add_movie(args):
    """Add a movie to Radarr."""
    print(f"🔍 Searching for '{args.movie_name}'...")
    results = lookup_movie(args.movie_name)
    if not results:
        print(f"❌ No results found for '{args.movie_name}'")
        return

    movie = results[0]
    existing = None
    tmdb_id = movie.get("tmdbId")
    if tmdb_id is not None:
        for library_movie in get_movies():
            if library_movie.get("tmdbId") == tmdb_id:
                existing = library_movie
                break

    if existing:
        print("📚 Movie already exists in Radarr")
        profile_map = {profile.get("id"): profile.get("name") for profile in get_quality_profiles()}
        format_movie_header(existing, profile_map.get(existing.get("qualityProfileId")))
        print("=" * 60)
        return

    quality_profile_id, quality_profile_name = resolve_quality_profile(args.quality_profile)
    root_folder = resolve_root_folder(args.root_folder)
    monitored = not args.unmonitored

    payload = {
        "title": movie.get("title"),
        "tmdbId": movie.get("tmdbId"),
        "year": movie.get("year"),
        "qualityProfileId": quality_profile_id,
        "rootFolderPath": root_folder,
        "monitored": monitored,
        "addOptions": {
            "searchForMovie": args.search_now,
            "monitor": "movieOnly",
        },
    }
    if args.minimum_availability:
        payload["minimumAvailability"] = args.minimum_availability

    print(f"📦 Adding '{movie.get('title', 'Unknown')}' to Radarr...")
    result = make_request("/movie", method="POST", data=payload)

    format_movie_header(result, quality_profile_name)
    print(f"🗂️  Root Folder: {root_folder}")
    print(f"🔎 Search Now: {'✅ Yes' if args.search_now else '❌ No'}")
    if result.get("minimumAvailability"):
        print(f"📅 Minimum Availability: {result['minimumAvailability']}")
    print("=" * 60)
    print(f"✅ Successfully added '{movie.get('title', 'Unknown')}' to Radarr!")


def search_movie(args):
    """Trigger a movie search for an existing Radarr item."""
    movie = find_movie_in_library(args.movie_name)
    if not movie:
        print(f"❌ '{args.movie_name}' is not in Radarr")
        return

    command = {"name": "MoviesSearch", "movieIds": [movie["id"]]}
    result = make_request("/command", method="POST", data=command)

    print("\n" + "=" * 60)
    print(f"🎯 Search Triggered: {movie.get('title', 'Unknown')}")
    print("=" * 60)
    print(f"📌 Movie ID: {movie.get('id', 'Unknown')}")
    print(f"🧾 Command ID: {result.get('id', 'Unknown')}")
    print(f"📊 Status: {result.get('status', 'Unknown')}")
    print("=" * 60)


def queue_status(args):
    """Show Radarr queue status."""
    queue = make_request("/queue")
    records = queue.get("records", []) if isinstance(queue, dict) else queue

    if not records:
        print("✅ Queue is empty!")
        return

    print(f"\n📦 Queue Status ({len(records)} items)")
    print("=" * 60)

    for item in records:
        movie_title = item.get("movie", {}).get("title") or item.get("title") or "Unknown Movie"
        status = item.get("status", "Unknown")
        progress = item.get("sizeleft")
        total_size = item.get("size")

        print(f"\n🎬 {movie_title}")
        print(f"   📊 Status: {status}")
        if total_size is not None and progress is not None:
            done = max(total_size - progress, 0)
            pct = (done / total_size * 100) if total_size else 0
            print(f"   ⏳ Progress: {pct:.1f}%")

        if args.detailed:
            if item.get("quality"):
                quality_name = item.get("quality", {}).get("quality", {}).get("name")
                if quality_name:
                    print(f"   🎯 Quality: {quality_name}")
            if total_size is not None:
                print(f"   💾 Size: {format_file_size(total_size)}")
            if item.get("timeleft"):
                print(f"   ⏱️  Time Left: {item['timeleft']}")
            if item.get("indexer"):
                print(f"   📡 Indexer: {item['indexer']}")
            if item.get("trackedDownloadState"):
                print(f"   🚚 Download State: {item['trackedDownloadState']}")

    print("=" * 60)


def list_movies(args):
    """List Radarr movies."""
    movies = sorted(get_movies(), key=lambda movie: movie.get("sortTitle", movie.get("title", "")))

    if not movies:
        print("❌ No movies found in Radarr")
        return

    print(f"\n🎬 Movies ({len(movies)} total)")
    print("=" * 60)
    for movie in movies:
        title = movie.get("title", "Unknown")
        year = movie.get("year", "Unknown")
        monitored = "✅" if movie.get("monitored") else "❌"
        downloaded = "✅" if movie.get("hasFile") else "❌"
        print(f"{monitored} {downloaded} {title} ({year})")
        if args.detailed:
            print(f"   📁 {movie.get('path', 'Unknown')}")
            if movie.get("sizeOnDisk") is not None:
                print(f"   💾 {format_file_size(movie['sizeOnDisk'])}")
    print("=" * 60)


def movie_info(args):
    """Show detailed info for a Radarr movie."""
    movie = find_movie_in_library(args.movie_name)
    if not movie:
        print(f"❌ '{args.movie_name}' is not in Radarr")
        return

    profiles = {profile.get("id"): profile.get("name") for profile in get_quality_profiles()}
    format_movie_header(movie, profiles.get(movie.get("qualityProfileId")))
    print(f"🆔 TMDb ID: {movie.get('tmdbId', 'Unknown')}")
    if movie.get("minimumAvailability"):
        print(f"📅 Minimum Availability: {movie['minimumAvailability']}")
    if movie.get("originalLanguage", {}).get("name"):
        print(f"🗣️  Language: {movie['originalLanguage']['name']}")
    if movie.get("physicalRelease"):
        print(f"💿 Physical Release: {movie['physicalRelease']}")
    if movie.get("inCinemas"):
        print(f"🎞️  In Cinemas: {movie['inCinemas']}")
    if movie.get("youTubeTrailerId"):
        print(f"▶️  Trailer ID: {movie['youTubeTrailerId']}")
    print("=" * 60)


def update_movie(args):
    """Update settings for an existing Radarr movie."""
    movie = find_movie_in_library(args.movie_name)
    if not movie:
        print(f"❌ '{args.movie_name}' is not in Radarr")
        return

    quality_profile_name = None
    if args.quality_profile is not None:
        quality_profile_id, quality_profile_name = resolve_quality_profile(args.quality_profile)
        movie["qualityProfileId"] = quality_profile_id

    if args.root_folder:
        movie["rootFolderPath"] = args.root_folder

    if args.monitored:
        movie["monitored"] = True
    elif args.unmonitored:
        movie["monitored"] = False

    if args.minimum_availability:
        movie["minimumAvailability"] = args.minimum_availability

    updated = make_request(f"/movie/{movie['id']}", method="PUT", data=movie)
    profiles = {profile.get("id"): profile.get("name") for profile in get_quality_profiles()}
    format_movie_header(updated, quality_profile_name or profiles.get(updated.get("qualityProfileId")))
    if updated.get("minimumAvailability"):
        print(f"📅 Minimum Availability: {updated['minimumAvailability']}")
    print("=" * 60)
    print(f"✅ Updated '{updated.get('title', 'Unknown')}'")


def delete_movie(args):
    """Delete a movie from Radarr."""
    movie = find_movie_in_library(args.movie_name)
    if not movie:
        print(f"❌ '{args.movie_name}' is not in Radarr")
        return

    if not args.force:
        print("❌ Refusing to delete without --force")
        print("   Re-run with --force to confirm deletion.")
        return

    params = {
        "deleteFiles": str(bool(args.remove_files)).lower(),
        "addImportExclusion": "false",
    }
    make_request(f"/movie/{movie['id']}", method="DELETE", params=params)

    print("\n" + "=" * 60)
    print(f"🗑️  Deleted: {movie.get('title', 'Unknown')}")
    print("=" * 60)
    print(f"📌 Movie ID: {movie.get('id', 'Unknown')}")
    print(f"📁 Removed Files: {'✅ Yes' if args.remove_files else '❌ No'}")
    print("=" * 60)


def stats(args):
    """Show Radarr library statistics."""
    movies = get_movies()
    if not movies:
        print("❌ No movies found in Radarr")
        return

    total_movies = len(movies)
    monitored = sum(1 for movie in movies if movie.get("monitored"))
    downloaded = sum(1 for movie in movies if movie.get("hasFile"))
    missing = total_movies - downloaded
    total_size = sum(movie.get("sizeOnDisk") or 0 for movie in movies)
    years = [movie.get("year") for movie in movies if movie.get("year")]

    print("\n📊 Radarr Library Statistics")
    print("=" * 60)
    print(f"🎬 Total Movies: {total_movies}")
    print(f"👁️  Monitored: {monitored}")
    print(f"📦 Downloaded: {downloaded}")
    print(f"❌ Missing: {missing}")
    print(f"💾 Size on Disk: {format_file_size(total_size)}")
    if years:
        print(f"📅 Year Range: {min(years)} - {max(years)}")
    print(f"🗂️  Local Config Path: {LOCAL_CONFIG_PATH}")
    print("=" * 60)


def missing_movies(args):
    """List missing movies from Radarr's wanted view."""
    missing = make_request(
        "/wanted/missing",
        params={"page": 1, "pageSize": 250, "sortKey": "physicalRelease", "sortDirection": "descending"},
    )
    records = missing.get("records", []) if isinstance(missing, dict) else missing

    if not records:
        print("✅ No missing movies!")
        return

    print(f"\n❌ Missing Movies ({len(records)} shown)")
    print("=" * 60)
    for movie in records:
        title = movie.get("title", "Unknown")
        year = movie.get("year", "Unknown")
        print(f"🎬 {title} ({year})")
        if movie.get("physicalRelease"):
            print(f"   💿 Physical Release: {movie['physicalRelease']}")
        if movie.get("minimumAvailability"):
            print(f"   📅 Minimum Availability: {movie['minimumAvailability']}")
    print("=" * 60)


def list_quality_profiles(args):
    """List Radarr quality profiles."""
    profiles = get_quality_profiles()
    if not profiles:
        print("❌ No quality profiles found")
        return

    print(f"\n🎯 Quality Profiles ({len(profiles)} profiles)")
    print("=" * 60)
    for profile in profiles:
        print(f"\n📋 {profile.get('name', 'Unknown')} (ID: {profile.get('id', 'Unknown')})")
        if profile.get("cutoff"):
            cutoff = profile["cutoff"]
            if isinstance(cutoff, dict):
                cutoff = cutoff.get("name", cutoff)
            print(f"   🎯 Cutoff: {cutoff}")
        if args.detailed and profile.get("items"):
            print("   📊 Qualities:")
            for item in profile["items"]:
                quality = item.get("quality", {}).get("name")
                if quality:
                    allowed = item.get("allowed", False)
                    print(f"      {'✅' if allowed else '❌'} {quality}")
    print("=" * 60)


def list_root_folders(args):
    """List Radarr root folders."""
    folders = get_root_folders()
    if not folders:
        print("❌ No root folders found")
        return

    print(f"\n📁 Root Folders ({len(folders)} folders)")
    print("=" * 60)
    for folder in folders:
        print(f"\n📂 {folder.get('name') or folder.get('path', 'Unknown')}")
        print(f"   📁 Path: {folder.get('path', 'Unknown')}")
        if folder.get("freeSpace") is not None:
            print(f"   💾 Free Space: {format_file_size(folder['freeSpace'])}")
        if folder.get("totalSpace") is not None:
            print(f"   💾 Total Space: {format_file_size(folder['totalSpace'])}")
        if args.detailed and folder.get("unmappedFolders"):
            print(f"   ⚠️  Unmapped Folders: {folder['unmappedFolders']}")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Radarr Skill - Interact with Radarr instance")
    parser.add_argument(
        "action",
        choices=[
            "add-movie",
            "search-movie",
            "queue",
            "list-movies",
            "movie-info",
            "update-movie",
            "delete-movie",
            "stats",
            "missing",
            "list-quality-profiles",
            "list-root-folders",
        ],
        help="Action to perform",
    )
    parser.add_argument("movie_name", nargs="?", help="Movie name for actions that target a movie")
    parser.add_argument("--detailed", action="store_true", help="Show detailed information")
    parser.add_argument("--force", action="store_true", help="Force destructive actions")
    parser.add_argument("--quality-profile", type=int, help="Quality profile ID")
    parser.add_argument("--root-folder", type=str, help="Root folder path")
    parser.add_argument("--search-now", action="store_true", help="Search immediately after adding")
    parser.add_argument("--remove-files", action="store_true", help="Delete files when removing a movie")
    parser.add_argument("--monitored", action="store_true", help="Monitor the movie")
    parser.add_argument("--unmonitored", action="store_true", help="Do not monitor the movie")
    parser.add_argument(
        "--minimum-availability",
        choices=["announced", "inCinemas", "released", "preDB"],
        help="Minimum availability for the movie",
    )

    args = parser.parse_args()

    if args.monitored and args.unmonitored:
        print("❌ Use only one of --monitored or --unmonitored")
        sys.exit(1)

    if args.action in {"add-movie", "search-movie", "movie-info", "update-movie", "delete-movie"} and not args.movie_name:
        print("❌ Error: Please specify a movie name")
        sys.exit(1)

    if args.action == "add-movie":
        add_movie(args)
    elif args.action == "search-movie":
        search_movie(args)
    elif args.action == "queue":
        queue_status(args)
    elif args.action == "list-movies":
        list_movies(args)
    elif args.action == "movie-info":
        movie_info(args)
    elif args.action == "update-movie":
        update_movie(args)
    elif args.action == "delete-movie":
        delete_movie(args)
    elif args.action == "stats":
        stats(args)
    elif args.action == "missing":
        missing_movies(args)
    elif args.action == "list-quality-profiles":
        list_quality_profiles(args)
    elif args.action == "list-root-folders":
        list_root_folders(args)


if __name__ == "__main__":
    main()
