# Sonarr Skill

The ALL-IN-ONE skill for Sonarr operations. A comprehensive skill for interacting with Sonarr instances to manage TV shows with full API integration and detailed metadata.

**This is the only skill you need for Sonarr** - handles adding shows, requesting shows, managing shows, checking status, and downloading episodes.

## Features

- **Full Sonarr Integration**: Add shows, check queue, download episodes, manage collections
- **Environment-Based Authentication**: Automatically reads API key from `.zshenv`
- **Detailed Metadata**: All responses include comprehensive show/episode information
- **Error Handling**: Graceful API error handling with informative messages
- **Formatted Output**: Clean, readable responses with emojis and structured data

## Setup

### Prerequisites

1. **Environment Variables**: Make sure your `.zshenv` file contains:
   ```bash
   export SONARR_API_KEY="your-api-key-here"
   export SONARR_URL="https://sonarr.home.alyoshukai.com"
   ```

2. **Dependencies**: The skill uses standard Python libraries:
   - `requests` for HTTP requests
   - `argparse` for command-line arguments
   - `json` for JSON handling

### Installation

The skill is automatically synced to:
- `~/.openclaw/workspace/skills/sonarr`
- `~/.opencode/skills/sonarr`
- `~/.codex/skills/sonarr`

## Usage Examples

### Request/Get a TV Show (Add with Quality Selection)
```bash
python3 scripts/sonarr.py add-show "The Last of Us"
python3 scripts/sonarr.py add-show "Breaking Bad" --quality-profile 10 --seasons "1,2,3"
python3 scripts/sonarr.py add-show "Stranger Things" --seasons all --monitored
```

### Download Episodes (When show is already in Sonarr)
```bash
python3 scripts/sonarr.py download-episode "The Last of Us" --season 1 --episodes "1,2,3"
python3 scripts/sonarr.py download-episode "Breaking Bad" --season 1 --all-episodes
```

### Check Queue Status
```bash
python3 scripts/sonarr.py queue
python3 scripts/sonarr.py queue --detailed
```

### Download Episodes
```bash
python3 scripts/sonarr.py download-episode "The Last of Us" --season 1 --episodes "1,2,3"
python3 scripts/sonarr.py download-episode "Breaking Bad" --season 1 --all-episodes
```

### Manage Collections
```bash
python3 scripts/sonarr.py list-shows
python3 scripts/sonarr.py show-info "The Last of Us"
python3 scripts/sonarr.py update-show "Breaking Bad" --seasons "1,2,3"
```

### Statistics and Status
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

## For AI Agents

**ALWAYS use this skill for ANY Sonarr interaction.**

### When to Use This Skill

**Use this skill for ALL of these scenarios:**

**Requesting/Getting shows:**
- "Get me The Last of Us"
- "Request Breaking Bad season 1"
- "Add The Witcher to my shows"
- "Download Severance"
- "I want to watch The Bear"
- "Can you grab Reacher for me?"

**Managing shows:**
- "Check my Sonarr queue"
- "What shows are in my library?"
- "Update The Witcher to monitor seasons 1-3"
- "Delete The Last of Us and remove files"

**Checking status:**
- "What's missing from my shows?"
- "What's coming up next?"
- "Show me my library statistics"

### Why Use This Skill
1. **Single Skill**: ONE skill handles ALL Sonarr operations (no separate "request" skill needed)
2. **Authentication**: Automatically handles API key from `.zshenv`
3. **Detailed Metadata**: Provides comprehensive information as requested
4. **Error Handling**: Graceful API error handling
5. **Formatted Output**: Clean, readable responses
6. **Full Integration**: Access all Sonarr features including requesting shows with quality selection

### Example Interactions
Instead of calling the Sonarr API directly:
- ❌ "Call Sonarr API to add The Last of Us"
- ✅ "Add The Last of Us to my Sonarr" (use the skill)

The skill handles:
- TV show lookup and matching
- Quality profile selection
- Season monitoring
- Interactive search
- File path management
- Statistics and status reporting

## Output Format

The skill provides detailed, formatted output with:

### Show Information
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

### Episode Download
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

## API Endpoints Used

- `/api/v3/series` - Series management
- `/api/v3/episode` - Episode management
- `/api/v3/queue` - Queue status
- `/api/v3/command` - Command execution
- `/api/v3/qualityprofile` - Quality profiles
- `/api/v3/rootfolder` - Root folders
- `/api/v3/system/status` - System status
- `/api/v3/calendar` - Upcoming episodes

## Troubleshooting

### Authentication Errors
```bash
# Check if API key is in .zshenv
grep SONARR_API_KEY ~/.zshenv

# Test API key reading
python3 -c "import sys; sys.path.insert(0, '/path/to/sonarr/scripts'); import sonarr; print(sonarr.get_api_key_from_zshenv())"
```

### Connection Errors
```bash
# Check Sonarr URL
echo $SONARR_URL

# Test connection (if Sonarr is running)
curl -H "X-Api-Key: $SONARR_API_KEY" $SONARR_URL/api/v3/system/status
```

### No Results Found
- Make sure the show is available in Sonarr's search index
- Try different show names or TVDB/IMDb IDs
- Check if Sonarr has access to your indexers

## Development

### Adding New Features
1. Edit the main script in `scripts/sonarr.py`
2. Add new actions to the argument parser
3. Implement the corresponding function
4. Update SKILL.md documentation
5. Sync to targets with `sync_skill_links.py`

### Testing
```bash
# Test API key reading
python3 scripts/sonarr.py list-shows

# Test help output
python3 scripts/sonarr.py --help

# Test specific action
python3 scripts/sonarr.py queue
```

## Related Skills

- **moviescout**: For requesting movies through Radarr
- **subtitlescout**: For managing subtitles via Bazarr

## Version

0.1.0

## Author

alyosha