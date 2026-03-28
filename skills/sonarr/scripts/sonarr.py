#!/usr/bin/env python3
"""
Sonarr Skill - Interact with Sonarr instance to manage TV shows.
Provides full Sonarr integration with detailed metadata in responses.
"""

import argparse
import json
import os
import re
import sys
import subprocess
import requests
from datetime import datetime


def get_api_key_from_zshenv():
    """Read SONARR_API_KEY from .zshenv file."""
    zshenv_path = os.path.expanduser('~/.zshenv')
    if not os.path.exists(zshenv_path):
        return None
    
    with open(zshenv_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line.startswith('export SONARR_API_KEY='):
                # Extract the value between quotes
                match = re.search(r'export SONARR_API_KEY=["\']([^"\']+)["\']', line)
                if match:
                    return match.group(1)
    return None


def get_sonarr_config():
    """Get Sonarr configuration from environment."""
    api_key = os.getenv('SONARR_API_KEY')
    if not api_key:
        api_key = get_api_key_from_zshenv()
    
    url = os.getenv('SONARR_URL', 'http://localhost:8989')
    
    if not api_key:
        print("❌ Error: SONARR_API_KEY not found in environment or .zshenv")
        print("   Please set SONARR_API_KEY in your .zshenv file:")
        print("   export SONARR_API_KEY=\"your-api-key-here\"")
        sys.exit(1)
    
    return {'url': url, 'api_key': api_key}


def make_request(endpoint, method='GET', data=None, params=None):
    """Make API request to Sonarr."""
    config = get_sonarr_config()
    url = f"{config['url']}/api/v3{endpoint}"
    headers = {'X-Api-Key': config['api_key']}
    
    try:
        if method == 'GET':
            response = requests.get(url, headers=headers, params=params, timeout=30)
        elif method == 'POST':
            response = requests.post(url, headers=headers, json=data, timeout=30)
        elif method == 'PUT':
            response = requests.put(url, headers=headers, json=data, timeout=30)
        elif method == 'DELETE':
            response = requests.delete(url, headers=headers, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        response.raise_for_status()
        return response.json() if response.content else {}
    except requests.exceptions.RequestException as e:
        print(f"❌ API Error: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"   Status: {e.response.status_code}")
            print(f"   Response: {e.response.text}")
        elif 'SSLError' in str(type(e).__name__):
            print(f"   🔒 SSL/TLS Error: {e}")
            print(f"   💡 Tip: Check if the Sonarr server is accessible and properly configured")
            print(f"   💡 Tip: Verify the URL is correct: {config['url']}")
            print(f"   💡 Tip: If using HTTPS, ensure SSL certificates are valid")
        sys.exit(1)


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
    
    # HDR (but not if it's DV)
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


def format_file_size(size_bytes):
    """Format file size in human-readable format."""
    if size_bytes is None:
        return "Unknown"
    
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} PB"


def add_show(args):
    """Add a TV show to Sonarr."""
    show_name = args.show_name
    
    # Search for the show
    print(f"🔍 Searching for '{show_name}'...")
    search_results = make_request('/series/lookup', params={'term': show_name})
    
    if not search_results:
        print(f"❌ No results found for '{show_name}'")
        return
    
    # Take the first result (could be improved to show options)
    show = search_results[0]
    
    # Prepare series data
    series_data = {
        'title': show['title'],
        'tvdbId': show.get('tvdbId'),
        'imdbId': show.get('imdbId'),
        'qualityProfileId': args.quality_profile or 1,  # Default to first profile
        'rootFolderPath': args.root_folder or None,
        'monitored': args.monitored,
        'addOptions': {
            'searchForMissingEpisodes': True,
            'ignoreExistingEpisodes': False
        }
    }
    
    # Add season monitoring if specified
    if args.seasons:
        # Parse seasons string (e.g., "1,2,3" or "all")
        if args.seasons.lower() == 'all':
            series_data['monitored'] = True
        else:
            # Convert to list of season numbers
            seasons = [int(s.strip()) for s in args.seasons.split(',') if s.strip().isdigit()]
            series_data['seasons'] = [{'seasonNumber': s, 'monitored': True} for s in seasons]
    
    print(f"📦 Adding '{show['title']}' to Sonarr...")
    result = make_request('/series', method='POST', data=series_data)
    
    # Print detailed result
    print("\n" + "="*60)
    print(f"📺 {show['title']} ({show.get('year', 'Unknown')})")
    print("="*60)
    print(f"📌 Show ID: {result.get('id', 'Unknown')}")
    print(f"📁 Status: {result.get('status', 'Unknown')}")
    print(f"📅 Year: {show.get('year', 'Unknown')}")
    
    if show.get('network'):
        print(f"🌐 Network: {show['network']}")
    
    if show.get('genres'):
        print(f"🎭 Genres: {', '.join(show['genres'])}")
    
    if result.get('path'):
        print(f"📁 Path: {result['path']}")
    
    print(f"📊 Monitored: {'✅ Yes' if args.monitored else '❌ No'}")
    print(f"🎯 Quality Profile ID: {series_data['qualityProfileId']}")
    
    if result.get('statistics'):
        stats = result['statistics']
        if 'sizeOnDisk' in stats:
            print(f"💾 Size: {format_file_size(stats['sizeOnDisk'])}")
        if 'episodeCount' in stats:
            print(f"📺 Episodes: {stats['episodeCount']}")
        if 'seasonCount' in stats:
            print(f"📚 Seasons: {stats['seasonCount']}")
    
    print("="*60)
    print(f"✅ Successfully added '{show['title']}' to Sonarr!")


def queue_status(args):
    """Check queue status."""
    queue = make_request('/queue')
    
    if not queue.get('records'):
        print("✅ Queue is empty!")
        return
    
    print(f"\n📦 Queue Status ({len(queue['records'])} items)")
    print("="*60)
    
    for item in queue['records']:
        show_title = item.get('series', {}).get('title', 'Unknown Show')
        episode_title = item.get('episode', {}).get('title', 'Unknown Episode')
        status = item.get('status', 'Unknown')
        progress = item.get('progress', 0) * 100
        
        print(f"\n📺 {show_title}")
        print(f"   📝 Episode: {episode_title}")
        print(f"   📊 Status: {status} ({progress:.1f}%)")
        
        if args.detailed:
            if item.get('estimatedCompletionTime'):
                eta = datetime.fromisoformat(item['estimatedCompletionTime'].replace('Z', '+00:00'))
                print(f"   ⏱️  ETA: {eta.strftime('%H:%M:%S')}")
            
            if item.get('size'):
                print(f"   💾 Size: {format_file_size(item['size'])}")
            
            if item.get('indexer'):
                print(f"   📡 Indexer: {item['indexer']}")
    
    print("="*60)


def download_episode(args):
    """Download specific episodes."""
    show_name = args.show_name
    
    # Search for the show
    print(f"🔍 Searching for '{show_name}'...")
    search_results = make_request('/series/lookup', params={'term': show_name})
    
    if not search_results:
        print(f"❌ No results found for '{show_name}'")
        return
    
    show = search_results[0]
    show_id = show.get('id')
    
    if not show_id:
        # Show might not be in Sonarr yet
        print(f"❌ '{show_name}' not found in Sonarr library")
        print("   Use 'add-show' first to add it to Sonarr")
        return
    
    # Get episodes for the specified season
    if args.season:
        episodes = make_request('/episode', params={'seriesId': show_id, 'seasonNumber': args.season})
        
        # Filter episodes
        if args.episodes:
            # Parse episodes list (e.g., "1,2,3")
            episode_nums = [int(e.strip()) for e in args.episodes.split(',') if e.strip().isdigit()]
            episodes = [e for e in episodes if e['episodeNumber'] in episode_nums]
        elif not args.all_episodes:
            print(f"❌ Please specify episodes with --episodes or use --all-episodes")
            return
        
        if not episodes:
            print(f"❌ No episodes found for season {args.season}")
            return
        
        print(f"📦 Found {len(episodes)} episode(s) to download")
        
        # Trigger download for each episode
        for episode in episodes:
            print(f"\n⬇️  Downloading: S{args.season:02d}E{episode['episodeNumber']:02d} - {episode.get('title', 'Unknown')}")
            
            # Search for this specific episode
            command_data = {
                'name': 'episodeSearch',
                'episodeIds': [episode['id']]
            }
            
            result = make_request('/command', method='POST', data=command_data)
            
            if result.get('id'):
                print(f"   ✅ Search triggered (Command ID: {result['id']})")
            else:
                print(f"   ❌ Failed to trigger search")
            
            # Get episode file info if available
            if episode.get('hasFile'):
                episode_file = make_request(f'/episodefile/{episode["episodeFileId"]}')
                if episode_file:
                    quality = parse_quality(episode_file.get('quality', {}).get('quality', {}).get('name', 'Unknown'))
                    size = format_file_size(episode_file.get('size'))
                    
                    print(f"   💾 Size: {size}")
                    print(f"   📐 Quality: {quality['resolution']}")
                    if quality['dv']:
                        print(f"   🎨 Video: Dolby Vision ✅")
                    if quality['hdr']:
                        print(f"      HDR ✅")
                    if quality['audio'] != 'Unknown':
                        print(f"   🔊 Audio: {quality['audio']}")
                    print(f"   📁 Path: {episode_file.get('path', 'Unknown')}")
    
    else:
        print("❌ Please specify a season with --season")


def list_shows(args):
    """List all shows in Sonarr library."""
    shows = make_request('/series')
    
    if not shows:
        print("❌ No shows found in Sonarr library")
        return
    
    print(f"\n📺 TV Shows in Sonarr ({len(shows)} shows)")
    print("="*60)
    
    for show in shows:
        title = show.get('title', 'Unknown')
        year = show.get('year', '')
        status = show.get('status', 'Unknown')
        monitored = show.get('monitored', False)
        
        print(f"\n{'📡' if monitored else '📺'} {title} ({year})")
        print(f"   📊 Status: {status}")
        print(f"   📎 Monitored: {'✅ Yes' if monitored else '❌ No'}")
        
        if show.get('statistics'):
            stats = show['statistics']
            if 'sizeOnDisk' in stats:
                print(f"   💾 Size: {format_file_size(stats['sizeOnDisk'])}")
            if 'episodeCount' in stats:
                print(f"   📺 Episodes: {stats['episodeCount']}")
            if 'seasonCount' in stats:
                print(f"   📚 Seasons: {stats['seasonCount']}")
        
        if args.detailed and show.get('path'):
            print(f"   📁 Path: {show['path']}")
    
    print("="*60)


def show_info(args):
    """Get detailed info about a specific show."""
    show_name = args.show_name
    
    # Search for the show in library
    shows = make_request('/series')
    show = None
    
    for s in shows:
        if s['title'].lower() == show_name.lower():
            show = s
            break
    
    if not show:
        print(f"❌ '{show_name}' not found in Sonarr library")
        return
    
    print(f"\n📺 Detailed Info: {show['title']}")
    print("="*60)
    
    # Basic info
    print(f"📌 Show ID: {show['id']}")
    print(f"📅 Year: {show.get('year', 'Unknown')}")
    print(f"📊 Status: {show.get('status', 'Unknown')}")
    print(f"📡 Monitored: {'✅ Yes' if show.get('monitored') else '❌ No'}")
    
    if show.get('network'):
        print(f"🌐 Network: {show['network']}")
    
    if show.get('genres'):
        print(f"🎭 Genres: {', '.join(show['genres'])}")
    
    if show.get('overview'):
        print(f"📝 Overview: {show['overview'][:200]}...")
    
    # Statistics
    if show.get('statistics'):
        stats = show['statistics']
        print(f"\n📊 Statistics:")
        if 'sizeOnDisk' in stats:
            print(f"   💾 Total Size: {format_file_size(stats['sizeOnDisk'])}")
        if 'episodeCount' in stats:
            print(f"   📺 Total Episodes: {stats['episodeCount']}")
        if 'seasonCount' in stats:
            print(f"   📚 Seasons: {stats['seasonCount']}")
        if 'episodeFileCount' in stats:
            print(f"   📁 Episodes with Files: {stats['episodeFileCount']}")
    
    # Seasons info
    if show.get('seasons'):
        print(f"\n📚 Seasons:")
        for season in show['seasons']:
            season_num = season.get('seasonNumber')
            monitored = season.get('monitored', False)
            stats = season.get('statistics', {})
            
            print(f"   📅 Season {season_num}: {'📡' if monitored else '📺'}", end="")
            if stats.get('episodeCount'):
                print(f" {stats['episodeCount']} episodes", end="")
            if stats.get('sizeOnDisk'):
                print(f" ({format_file_size(stats['sizeOnDisk'])})", end="")
            print()
    
    # Path info
    if show.get('path'):
        print(f"\n📁 Path: {show['path']}")
    
    # Quality profile
    if show.get('qualityProfileId'):
        quality_profiles = make_request('/qualityprofile')
        profile = next((p for p in quality_profiles if p['id'] == show['qualityProfileId']), None)
        if profile:
            print(f"🎯 Quality Profile: {profile['name']}")
    
    print("="*60)


def update_show(args):
    """Update a show's settings."""
    show_name = args.show_name
    
    # Find the show
    shows = make_request('/series')
    show = None
    
    for s in shows:
        if s['title'].lower() == show_name.lower():
            show = s
            break
    
    if not show:
        print(f"❌ '{show_name}' not found in Sonarr library")
        return
    
    print(f"🔍 Updating '{show['title']}'...")
    
    # Prepare update data
    update_data = show.copy()
    
    if args.seasons:
        if args.seasons.lower() == 'all':
            # Monitor all seasons
            for season in update_data['seasons']:
                season['monitored'] = True
        else:
            # Parse specific seasons
            seasons_to_monitor = [int(s.strip()) for s in args.seasons.split(',') if s.strip().isdigit()]
            for season in update_data['seasons']:
                season['monitored'] = season['seasonNumber'] in seasons_to_monitor
    
    if args.quality_profile:
        update_data['qualityProfileId'] = args.quality_profile
    
    if args.monitored is not None:
        update_data['monitored'] = args.monitored
    
    # Update the show
    result = make_request(f'/series/{show["id"]}', method='PUT', data=update_data)
    
    # Print result
    print(f"\n✅ Successfully updated '{show['title']}'")
    
    if args.seasons:
        seasons_str = args.seasons
        print(f"   📚 Monitoring seasons: {seasons_str}")
    
    if args.quality_profile:
        print(f"   🎯 Quality Profile ID: {args.quality_profile}")
    
    if args.monitored is not None:
        print(f"   📡 Overall monitoring: {'Enabled' if args.monitored else 'Disabled'}")


def delete_show(args):
    """Delete a show from Sonarr."""
    show_name = args.show_name
    
    # Find the show
    shows = make_request('/series')
    show = None
    
    for s in shows:
        if s['title'].lower() == show_name.lower():
            show = s
            break
    
    if not show:
        print(f"❌ '{show_name}' not found in Sonarr library")
        return
    
    if not args.force:
        confirm = input(f"Are you sure you want to delete '{show['title']}'? [y/N]: ")
        if confirm.lower() != 'y':
            print("❌ Deletion cancelled")
            return
    
    print(f"🗑️  Deleting '{show['title']}'...")
    
    # Delete the show
    params = {}
    if args.remove_files:
        params['deleteFiles'] = True
    
    result = make_request(f'/series/{show["id"]}', method='DELETE', params=params)
    
    print(f"✅ Successfully deleted '{show['title']}'")
    if args.remove_files:
        print("   📁 Files were also removed")


def stats(args):
    """Get Sonarr library statistics."""
    shows = make_request('/series')
    
    if not shows:
        print("❌ No shows found in Sonarr library")
        return
    
    total_size = 0
    total_episodes = 0
    total_seasons = 0
    monitored_shows = 0
    
    for show in shows:
        if show.get('statistics'):
            stats = show['statistics']
            total_size += stats.get('sizeOnDisk', 0)
            total_episodes += stats.get('episodeCount', 0)
            total_seasons += stats.get('seasonCount', 0)
        
        if show.get('monitored'):
            monitored_shows += 1
    
    print(f"\n📊 Sonarr Library Statistics")
    print("="*60)
    print(f"📺 Total Shows: {len(shows)}")
    print(f"📡 Monitored Shows: {monitored_shows}")
    print(f"📚 Total Seasons: {total_seasons}")
    print(f"📺 Total Episodes: {total_episodes}")
    print(f"💾 Total Size: {format_file_size(total_size)}")
    
    # Show breakdown by status
    status_counts = {}
    for show in shows:
        status = show.get('status', 'Unknown')
        status_counts[status] = status_counts.get(status, 0) + 1
    
    if status_counts:
        print(f"\n📈 Status Breakdown:")
        for status, count in sorted(status_counts.items()):
            print(f"   {status}: {count}")
    
    print("="*60)


def upcoming(args):
    """Get upcoming episodes."""
    episodes = make_request('/calendar', params={'unmonitored': 'false'})
    
    if not episodes:
        print("✅ No upcoming episodes!")
        return
    
    print(f"\n📅 Upcoming Episodes ({len(episodes)} episodes)")
    print("="*60)
    
    for episode in episodes:
        show_title = episode.get('series', {}).get('title', 'Unknown Show')
        episode_num = episode.get('episodeNumber', 0)
        season_num = episode.get('seasonNumber', 0)
        title = episode.get('title', 'Unknown Episode')
        air_date = episode.get('airDate', 'Unknown')
        
        print(f"\n📺 {show_title}")
        print(f"   📝 S{season_num:02d}E{episode_num:02d} - {title}")
        print(f"   📅 Air Date: {air_date}")
        
        if args.detailed and episode.get('hasFile'):
            print(f"   📁 Has File: ✅ Yes")
    
    print("="*60)


def missing(args):
    """Get missing episodes."""
    shows = make_request('/series')
    
    missing_episodes = []
    for show in shows:
        if not show.get('monitored'):
            continue
        
        episodes = make_request('/episode', params={'seriesId': show['id']})
        for episode in episodes:
            if not episode.get('hasFile') and episode.get('airDate'):
                # Check if episode should have aired already
                air_date = datetime.strptime(episode['airDate'], '%Y-%m-%d')
                if air_date < datetime.now():
                    missing_episodes.append({
                        'show': show['title'],
                        'season': episode['seasonNumber'],
                        'episode': episode['episodeNumber'],
                        'title': episode.get('title', 'Unknown'),
                        'air_date': episode['airDate']
                    })
    
    if not missing_episodes:
        print("✅ No missing episodes!")
        return
    
    print(f"\n❌ Missing Episodes ({len(missing_episodes)} episodes)")
    print("="*60)
    
    current_show = None
    for ep in missing_episodes:
        if ep['show'] != current_show:
            if current_show:
                print()
            current_show = ep['show']
            print(f"📺 {current_show}")
        
        print(f"   📅 S{ep['season']:02d}E{ep['episode']:02d} - {ep['title']} (aired: {ep['air_date']})")
    
    print("="*60)


def list_quality_profiles(args):
    """List quality profiles."""
    profiles = make_request('/qualityprofile')
    
    if not profiles:
        print("❌ No quality profiles found")
        return
    
    print(f"\n🎯 Quality Profiles ({len(profiles)} profiles)")
    print("="*60)
    
    for profile in profiles:
        print(f"\n📋 {profile['name']} (ID: {profile['id']})")
        
        if profile.get('cutoff'):
            print(f"   🎯 Cutoff: {profile['cutoff']}")
        
        if profile.get('items'):
            print(f"   📊 Qualities:")
            for item in profile['items']:
                quality = item.get('quality', {}).get('name', 'Unknown')
                allowed = item.get('allowed', False)
                print(f"      {'✅' if allowed else '❌'} {quality}")
    
    print("="*60)


def list_root_folders(args):
    """List root folders."""
    root_folders = make_request('/rootfolder')
    
    if not root_folders:
        print("❌ No root folders found")
        return
    
    print(f"\n📁 Root Folders ({len(root_folders)} folders)")
    print("="*60)
    
    for folder in root_folders:
        print(f"\n📂 {folder.get('name', 'Unknown')}")
        print(f"   📁 Path: {folder.get('path', 'Unknown')}")
        
        if folder.get('freeSpace'):
            print(f"   💾 Free Space: {format_file_size(folder['freeSpace'])}")
        
        if folder.get('totalSpace'):
            print(f"   💾 Total Space: {format_file_size(folder['totalSpace'])}")
    
    print("="*60)


def main():
    parser = argparse.ArgumentParser(description='Sonarr Skill - Interact with Sonarr instance')
    parser.add_argument('action', choices=[
        'add-show', 'queue', 'download-episode', 'list-shows', 'show-info',
        'update-show', 'delete-show', 'stats', 'upcoming', 'missing',
        'list-quality-profiles', 'list-root-folders'
    ], help='Action to perform')
    
    # Common arguments
    parser.add_argument('--detailed', action='store_true', help='Show detailed information')
    parser.add_argument('--force', action='store_true', help='Force action without confirmation')
    
    # Add show arguments
    parser.add_argument('--quality-profile', type=int, help='Quality profile ID')
    parser.add_argument('--root-folder', type=str, help='Root folder path')
    parser.add_argument('--monitored', action='store_true', default=True, help='Monitor show')
    parser.add_argument('--seasons', type=str, help='Seasons to monitor (e.g., "1,2,3" or "all")')
    
    # Download episode arguments
    parser.add_argument('--season', type=int, help='Season number')
    parser.add_argument('--episodes', type=str, help='Episode numbers (e.g., "1,2,3")')
    parser.add_argument('--all-episodes', action='store_true', help='Download all episodes in season')
    
    # Show name arguments
    parser.add_argument('show_name', nargs='?', help='Show name (for add-show, download-episode, show-info, etc.)')
    
    # Delete show arguments
    parser.add_argument('--remove-files', action='store_true', help='Also delete associated files when removing show')
    
    args = parser.parse_args()
    
    # Route to appropriate function
    if args.action == 'add-show':
        if not args.show_name:
            print("❌ Error: Please specify a show name")
            sys.exit(1)
        add_show(args)
    elif args.action == 'queue':
        queue_status(args)
    elif args.action == 'download-episode':
        if not args.show_name or not args.season:
            print("❌ Error: Please specify show name and season")
            sys.exit(1)
        download_episode(args)
    elif args.action == 'list-shows':
        list_shows(args)
    elif args.action == 'show-info':
        if not args.show_name:
            print("❌ Error: Please specify a show name")
            sys.exit(1)
        show_info(args)
    elif args.action == 'update-show':
        if not args.show_name:
            print("❌ Error: Please specify a show name")
            sys.exit(1)
        update_show(args)
    elif args.action == 'delete-show':
        if not args.show_name:
            print("❌ Error: Please specify a show name")
            sys.exit(1)
        delete_show(args)
    elif args.action == 'stats':
        stats(args)
    elif args.action == 'upcoming':
        upcoming(args)
    elif args.action == 'missing':
        missing(args)
    elif args.action == 'list-quality-profiles':
        list_quality_profiles(args)
    elif args.action == 'list-root-folders':
        list_root_folders(args)


if __name__ == '__main__':
    main()