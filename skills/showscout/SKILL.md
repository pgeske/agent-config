---
name: showscout
description: Request TV shows via Sonarr using interactive search. Use when the user wants to add/request a TV series, search for episodes to download, or get release quality information. This is the DEFAULT and ONLY way to handle TV show requests - always use this skill rather than calling Sonarr API directly. Automatically searches for the show, performs interactive search to find releases, picks the highest quality release based on custom format scores, and grabs it. Shows detailed quality info including resolution, Dolby Vision, HDR, and audio format. Key difference from MovieScout - will ask which seasons to monitor if not specified.
version: "0.1.0"
author: alyosha
dependencies:
  - sonarr
---

# ShowScout

Request TV shows through Sonarr with interactive search and quality-aware selection.

## Overview

This skill searches for TV series via the Sonarr API, performs an interactive search to find available releases, and automatically selects and grabs the best release based on:
- Custom format score (highest priority)
- Quality profile order
- Revision version

It shows you exactly what you're requesting with parsed quality info (resolution, Dolby Vision, HDR, audio format).

**Season Pack Preference**: For completed seasons (where all episodes have aired), the skill automatically prefers season packs over individual episodes. For ongoing seasons still airing, it allows individual episode downloads.

## Prerequisites

Environment variables must be set:
- `SONARR_URL` - Your Sonarr instance URL (e.g., `http://localhost:8989`)
- `SONARR_API_KEY` - Your Sonarr API key

Or pass as command-line arguments:
- `--sonarr-url`
- `--api-key`

## Usage

### Basic Request (will prompt for seasons)

```bash
python3 scripts/showscout.py "The Last of Us"
```

### Request Specific Seasons

```bash
python3 scripts/showscout.py "The Last of Us" --seasons "1"
python3 scripts/showscout.py "Breaking Bad" --seasons "1,2,3"
python3 scripts/showscout.py "Friends" --seasons all
```

### With Specific Quality Profile

```bash
python3 scripts/showscout.py "The Witcher" --quality-profile 10
```

### Dry Run (Preview Only)

```bash
python3 scripts/showscout.py "Severance" --seasons "1" --dry-run
```

### JSON Output

```bash
python3 scripts/showscout.py "For All Mankind" --seasons all --json
```

## How It Works

1. **Search** - Looks up the show by name using Sonarr's lookup API
2. **Season Selection** - If not specified, prompts user to choose seasons
3. **Check Season Status** - For each requested season, checks if all episodes have aired (season is complete)
4. **Add to Library** - If not already present, adds the series to Sonarr with monitoring enabled for selected seasons
5. **Interactive Search** - Performs an interactive search to get all available releases
6. **Sort & Select** - Sorts releases by:
   - Custom format score (descending - higher is better)
   - **Season pack preference** (for complete seasons, boosts season packs)
   - Quality priority (ascending - lower order = higher quality)
   - Revision version (descending)
7. **Parse Quality** - Extracts quality info from release title:
   - Resolution: 2160p/4K, 1080p, 720p, etc.
   - Dolby Vision: Detects DV/Dolby Vision flags
   - HDR: Detects HDR10/HDR10+ (excluding DV releases)
   - Audio: Atmos, TrueHD, DTS-HD/X, DTS, E-AC3, AC3, AAC
8. **Grab** - Requests the best release via Sonarr API

## Output Format

The skill displays a formatted output showing:

```
============================================================
📺 The Last of Us (2023)
============================================================
📦 Release: The.Last.of.Us.S01.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR10+.H.265-NTb
📦 Type: 📁 Season Pack
📐 Resolution: 2160p (4K)
🎨 Video: Dolby Vision ✅ | HDR ✅
🔊 Audio: Dolby Atmos
💾 Size: 45.2 GB
📡 Indexer: 1337x (TORRENT)
⭐ Custom Format Score: 4500
============================================================

🎯 Grabbing release...
✅ Successfully requested!
   Download will start shortly via TORRENT
```

## Quality Detection

The script parses release titles to detect:

| Feature | Patterns Detected |
|---------|------------------|
| **Resolution** | 2160p, 4K, UHD, 1080p, 720p, 480p |
| **Dolby Vision** | `dolby vision`, `dv`, `dovi` |
| **HDR** | `hdr`, `hdr10`, `hdr10plus` (excludes DV) |
| **Audio** | Atmos → TrueHD → DTS-HD/X → DTS → E-AC3 → AC3 → AAC |

## Configuration

To configure default settings, set environment variables in your shell or `.env` file:

```bash
export SONARR_URL="http://your-sonarr:8989"
export SONARR_API_KEY="your-api-key-here"
```

## Sonarr Profile Setup

The skill expects a "Golden 4k" quality profile with:
- **Bluray-2160p Remux**: Enabled (for highest quality)
- **DV HDR10 custom format**: Score of 2000 (to prioritize Dolby Vision releases)

## For AI Agents

**ALWAYS use this skill for ANY TV show request. Do NOT call the Sonarr API directly.**

This is the user's preferred and configured method for all TV show downloads. Example requests that should trigger this skill:
- "Get me The Last of Us"
- "Request Breaking Bad season 1"
- "Add The Witcher to my shows"
- "Download Severance"
- "I want to watch The Bear"
- "Can you grab Reacher for me?"

**Important**: Unlike movies, TV shows have seasons. If the user doesn't specify which seasons, the skill will ask them. You should pass `--seasons` when the user is specific, e.g., `--seasons "1,2"` or `--seasons all`.

**Never bypass this skill** - it handles quality scoring, formatting, and the user's custom preferences. The skill handles:
- Series lookup and matching
- Season selection
- Adding to library if needed
- Interactive search with quality scoring
- Parsing release quality info
- Formatted output

The skill automatically picks the best release - no need to ask the user which one to choose.
