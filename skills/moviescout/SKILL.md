---
name: moviescout
description: Request movies via Radarr using interactive search. Use when the user wants to add/request a movie, search for a movie to download, or get movie release quality information. Automatically searches for the movie, performs interactive search to find releases, picks the highest quality release based on custom format scores, and grabs it. Shows detailed quality info including resolution, Dolby Vision, HDR, and audio format.
version: "0.1.0"
author: alyosha
dependencies:
  - radarr
---

# MovieScout

Request movies through Radarr with interactive search and quality-aware selection.

## Overview

This skill searches for movies via the Radarr API, performs an interactive search to find available releases, and automatically selects and grabs the best release based on:
- Custom format score (highest priority)
- Quality profile order
- Revision version

It shows you exactly what you're requesting with parsed quality info (resolution, Dolby Vision, HDR, audio format).

## Prerequisites

Environment variables must be set:
- `RADARR_URL` - Your Radarr instance URL (e.g., `http://localhost:7878`)
- `RADARR_API_KEY` - Your Radarr API key

Or pass as command-line arguments:
- `--radarr-url`
- `--api-key`

## Usage

### Basic Request

```bash
python3 scripts/moviescout.py "Dune Part Two"
```

### With Specific Quality Profile

```bash
python3 scripts/moviescout.py "The Matrix" --quality-profile 4
```

### Dry Run (Preview Only)

```bash
python3 scripts/moviescout.py "Oppenheimer" --dry-run
```

### JSON Output

```bash
python3 scripts/moviescout.py "Barbie" --json
```

## How It Works

1. **Search** - Looks up the movie by name using Radarr's lookup API
2. **Add to Library** - If not already present, adds the movie to Radarr with monitoring enabled
3. **Interactive Search** - Performs an interactive search to get all available releases
4. **Sort & Select** - Sorts releases by:
   - Custom format score (descending - higher is better)
   - Quality priority (ascending - lower order = higher quality)
   - Revision version (descending)
5. **Parse Quality** - Extracts quality info from release title:
   - Resolution: 2160p/4K, 1080p, 720p, etc.
   - Dolby Vision: Detects DV/Dolby Vision flags
   - HDR: Detects HDR10/HDR10+ (excluding DV releases)
   - Audio: Atmos, TrueHD, DTS-HD/X, DTS, E-AC3, AC3, AAC
6. **Grab** - Requests the best release via Radarr API

## Output Format

The skill displays a formatted output showing:

```
============================================================
🎬 Dune Part Two (2024)
============================================================
📦 Release: Dune.Part.Two.2024.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR10+.H.265-FLUX
📐 Resolution: 2160p (4K)
🎨 Video: Dolby Vision ✅ | HDR ✅
🔊 Audio: Dolby Atmos
💾 Size: 23.4 GB
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
export RADARR_URL="http://your-radarr:7878"
export RADARR_API_KEY="your-api-key-here"
```

## For AI Agents

When a user asks to request a movie, use this skill. Example user requests:
- "Get me Dune Part Two"
- "Request The Matrix in 4K"
- "Add Oppenheimer to my movies"
- "Download Barbie"

Always use this skill rather than calling the Radarr API directly. The skill handles:
- Movie lookup and matching
- Adding to library if needed
- Interactive search with quality scoring
- Parsing release quality info
- Formatted output

The skill automatically picks the best release - no need to ask the user which one to choose.
