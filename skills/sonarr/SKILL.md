---
name: sonarr
description: Interact with Sonarr instance to manage TV shows. Use when agents need to add TV shows, check queue status, download specific episodes, manage collections, or get library statistics. Provides full Sonarr integration with detailed metadata in responses. Use this skill for ALL Sonarr operations including requesting TV shows.
version: "0.1.0"
author: alyosha
dependencies:
  - sonarr
---

# Sonarr

Interact with Sonarr to manage TV shows with full integration and detailed metadata.

## Overview

**This is the ONLY skill you need for Sonarr operations.** It handles:
- **Adding TV shows** - Search and add shows to Sonarr
- **Requesting shows** - Search for shows and trigger downloads
- **Managing shows** - Update settings, delete shows, manage collections
- **Checking status** - Queue status, upcoming episodes, missing episodes
- **Downloading episodes** - Specific episodes or entire seasons
- **Library statistics** - Get detailed stats about your library

**Use this skill for ALL Sonarr operations.** There is no separate "request" skill - all Sonarr functionality is provided here.

This skill provides agents with comprehensive access to Sonarr functionality, including:
- Adding TV shows to the library
- Checking queue status and upcoming episodes
- Downloading specific episodes or seasons
- Managing show collections
- Getting library statistics and status
- Viewing quality profiles and root folders

All responses include detailed metadata as requested.

## Prerequisites

Environment variables must be set in `.zshenv`:
- `SONARR_URL` - Your Sonarr instance URL (e.g., `https://sonarr.home.alyoshukai.com`)
- `SONARR_API_KEY` - Your Sonarr API key (read from `.zshenv`)

The skill will automatically read the API key from your `.zshenv` file.

## Local Configuration

- Sonarr container/config path: `~/containers/sonarr`
- Prefer the API for normal operations.
- Use `~/containers/sonarr` if you need to adjust local container config, env vars, compose files, or other on-disk settings.

## Usage

### Add TV Show

```bash
python3 scripts/sonarr.py add-show "The Last of Us"
python3 scripts/sonarr.py add-show "Breaking Bad" --quality-profile 10 --seasons "1,2"
python3 scripts/sonarr.py add-show "Stranger Things" --monitored
```

### Check Queue Status

```bash
python3 scripts/sonarr.py queue
python3 scripts/sonarr.py queue --detailed
```

### Download Specific Episodes

```bash
python3 scripts/sonarr.py download-episode "The Last of Us" --season 1 --episode 5
python3 scripts/sonarr.py download-episode "Breaking Bad" --season 2 --episodes "1,2,3"
python3 scripts/sonarr.py download-episode "Stranger Things" --season 1 --all-episodes
```

### Manage Collections

```bash
python3 scripts/sonarr.py list-shows
python3 scripts/sonarr.py show-info "The Last of Us"
python3 scripts/sonarr.py update-show "Breaking Bad" --seasons "1,2,3"
python3 scripts/sonarr.py delete-show "The Last of Us" --remove-files
```

### Library Statistics

```bash
python3 scripts/sonarr.py stats
python3 scripts/sonarr.py upcoming
python3 scripts/sonarr.py missing
```

### Quality Profiles and Root Folders

```bash
python3 scripts/sonarr.py list-quality-profiles
python3 scripts/sonarr.py list-root-folders
```

## How It Works

1. **Environment Setup** - Reads `SONARR_API_KEY` from `.zshenv` and `SONARR_URL` from environment
2. **API Connection** - Establishes connection to Sonarr API
3. **Function Execution** - Executes requested operation (add, check, download, manage, etc.)
4. **Metadata Collection** - Gathers detailed information about the operation
5. **Formatted Output** - Returns results with comprehensive metadata including:
   - Show details (title, year, network, genres)
   - Episode information (title, air date, duration, size)
   - Queue status (progress, estimated time remaining)
   - Quality profiles (resolution, codec, audio)
   - File paths and storage info
   - Statistics (episode counts, file sizes, disk usage)

## Output Format

The skill displays detailed formatted output showing:

```
============================================================
📺 The Last of Us (2023)
============================================================
📌 Show ID: 12345
📁 Status: Continuing
📅 Year: 2023
🌐 Network: HBO
🎭 Genres: Drama, Horror, Post-Apocalyptic
📁 Path: /media/tv/last-of-us/
📊 Seasons: 2 | Episodes: 16
💾 Size: 84.5 GB
🎬 Quality Profile: 4K DV HDR10+ Atmos
============================================================
```

For episode downloads:

```
============================================================
⬇️  Downloading Episode
============================================================
📺 Show: The Last of Us
📌 Episode: S01E05 - "Please"
📅 Air Date: 2023-04-02
📏 Duration: 55 min
📦 File Size: 4.2 GB
📐 Quality: 2160p (4K)
🎨 Video: Dolby Vision ✅ | HDR ✅
🔊 Audio: Dolby Atmos
💾 Path: /media/tv/last-of-us/Season 01/S01E05.mkv
🎯 Status: Downloading
============================================================
```

## Authentication

The skill reads the Sonarr API key and URL from your `.zshenv` file. Make sure you have:
```
export SONARR_API_KEY="your-api-key-here"
export SONARR_URL="https://sonarr.home.alyoshukai.com"
```

If an API-first change is not enough and local service configuration must be updated, check `~/containers/sonarr`.

## For AI Agents

**This is the ONLY skill you need for ANY Sonarr interaction.** There are no separate skills for requesting shows vs. managing shows - this skill handles everything.

### When to Use This Skill

**Use this skill for ALL of these scenarios:**
- "Add The Last of Us to my Sonarr"
- "Get me The Witcher" (request/seek a show)
- "Request Breaking Bad season 1" (request a show)
- "Download season 1 of Breaking Bad"
- "Check what's in my Sonarr queue"
- "Show me my TV show collection"
- "What TV shows am I missing episodes for?"
- "Update The Witcher to monitor seasons 1-3"
- "Delete The Last of Us and remove files"
- "Check upcoming episodes"
- "Get library statistics"

### Key Points

**This skill handles BOTH:**
1. **Adding/Requesting shows** - Searching for shows and adding them to Sonarr
2. **Managing shows** - Updating settings, downloading episodes, checking status

**No need for separate skills** - One skill does it all.

**Always use this skill rather than calling the Sonarr API directly.** The skill handles authentication, formatting, and provides detailed metadata as requested.

### Important Note About Quality Selection

When requesting shows, you can specify quality profiles using the `--quality-profile` parameter. For quality-aware selection similar to what showscout offered, you can:

1. Use `add-show` with a specific quality profile ID
2. Use `download-episode` with quality-specific episodes
3. Use `list-quality-profiles` to see available options

The skill will automatically use the appropriate quality profile when adding shows.

## API Endpoints Used

- `/api/v3/series` - Series management (add, list, update, delete)
- `/api/v3/episode` - Episode management
- `/api/v3/queue` - Queue status
- `/api/v3/command` - Command execution (download, search)
- `/api/v3/qualityprofile` - Quality profile management
- `/api/v3/rootfolder` - Root folder management
- `/api/v3/system/status` - System status and statistics
