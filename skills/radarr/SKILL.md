---
name: radarr
description: Interact with Radarr instance to manage movies. Use when agents need to add movies, inspect the queue, search monitored items, manage the library, check missing movies, or review quality profiles and root folders. Provides general Radarr integration beyond quality-aware movie grabbing.
version: "0.1.0"
author: alyosha
dependencies:
  - radarr
---

# Radarr

Interact with Radarr to manage movies with API-first workflows and detailed output.

## Overview

**This is the general-purpose skill for Radarr operations.** It handles:
- **Adding movies** - Search Radarr lookup results and add movies to the library
- **Searching monitored items** - Trigger Radarr searches for an existing movie
- **Managing the library** - List, inspect, update, and delete movies
- **Checking status** - Queue inspection, missing movie checks, and library statistics
- **Reviewing config-backed metadata** - Quality profiles and root folders

Use this skill for day-to-day Radarr management. If the user specifically wants a quality-aware interactive release pick-and-grab workflow, use `moviescout`.

## Prerequisites

Environment variables should be available in your shell or `.zshenv`:
- `RADARR_URL` - Your Radarr instance URL
- `RADARR_API_KEY` - Your Radarr API key

The helper script will read these from the environment first and then fall back to `.zshenv`.

## Local Configuration

- Radarr container/config path: `~/containers/radarr`
- Prefer the Radarr API for routine operations.
- If the task requires local configuration changes, container env updates, compose edits, or other on-disk changes, inspect `~/containers/radarr`.

## Usage

### Add a Movie

```bash
python3 scripts/radarr.py add-movie "Dune Part Two"
python3 scripts/radarr.py add-movie "The Matrix" --quality-profile 4 --search-now
python3 scripts/radarr.py add-movie "Blade Runner 2049" --root-folder "/media/movies" --unmonitored
```

### Search an Existing Movie

```bash
python3 scripts/radarr.py search-movie "Dune Part Two"
```

### Inspect Queue and Library

```bash
python3 scripts/radarr.py queue
python3 scripts/radarr.py queue --detailed
python3 scripts/radarr.py list-movies
python3 scripts/radarr.py movie-info "Dune Part Two"
```

### Update or Delete a Movie

```bash
python3 scripts/radarr.py update-movie "Dune Part Two" --quality-profile 4
python3 scripts/radarr.py update-movie "Dune Part Two" --unmonitored
python3 scripts/radarr.py delete-movie "Dune Part Two" --remove-files
```

### Status and Configuration Metadata

```bash
python3 scripts/radarr.py stats
python3 scripts/radarr.py missing
python3 scripts/radarr.py list-quality-profiles
python3 scripts/radarr.py list-root-folders
```

## How It Works

1. **Environment Setup** - Reads `RADARR_API_KEY` and `RADARR_URL` from the environment or `.zshenv`
2. **API Connection** - Establishes connection to the Radarr API
3. **Function Execution** - Runs the requested library, queue, search, or configuration action
4. **Metadata Collection** - Gathers movie details, quality profile info, paths, and queue status
5. **Formatted Output** - Returns structured output that is easy to scan in the CLI

## Authentication

The skill expects:

```bash
export RADARR_API_KEY="your-api-key-here"
export RADARR_URL="https://radarr.example.com"
```

If an API-first action is not enough and local service configuration must be changed, check `~/containers/radarr`.

## For AI Agents

Use this skill for tasks like:
- "Add Dune Part Two to Radarr"
- "Search Radarr for Oppenheimer"
- "Show me my Radarr queue"
- "List missing movies in Radarr"
- "Update the quality profile for The Matrix"
- "Delete Barbie from Radarr and remove files"
- "Show me Radarr root folders"
- "Give me Radarr library stats"

### Key Points

- Use `radarr` for general Radarr management.
- Use `moviescout` when the user wants the best available release chosen and grabbed automatically.
- Prefer API changes first; use `~/containers/radarr` only when a filesystem-level change is actually needed.

## API Endpoints Used

- `/api/v3/movie` - Movie management
- `/api/v3/movie/lookup` - Movie lookup
- `/api/v3/queue` - Queue status
- `/api/v3/command` - Search commands
- `/api/v3/wanted/missing` - Missing movie reporting
- `/api/v3/qualityprofile` - Quality profile management
- `/api/v3/rootfolder` - Root folder management
