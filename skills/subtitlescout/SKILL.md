---
name: subtitlescout
description: Manage subtitles via Bazarr (status/health, list series/movies, search and download subtitles). Use whenever the user asks about subtitles, Bazarr, subtitle downloads, missing subs, or subtitle management.
version: "0.1.0"
author: alyosha
dependencies:
  - bazarr
---

# SubtitleScout (Bazarr)

Use Bazarr to check subtitle health/status, inspect known series/movies, and trigger subtitle searches/downloads.

## Config (secret)

This skill uses environment variables (preferred):

- `BAZARR_URL`
- `BAZARR_API_KEY`

Do **not** print the API key in chat output.

## Wrapper

All actions must be executed via the wrapper script:

- `python3 subtitlescout/scripts/bazarrctl.py ...`

## Common workflows (commands to run via `exec`)

### 1) Check Bazarr status / health

```bash
python3 subtitlescout/scripts/bazarrctl.py status
python3 subtitlescout/scripts/bazarrctl.py health
```

### 2) List known series/movies (sanitized summary)

```bash
python3 subtitlescout/scripts/bazarrctl.py list-series --limit 50
python3 subtitlescout/scripts/bazarrctl.py list-movies --limit 50
```

### 3) Search subtitles (best-effort)

Bazarr API differs by version; this tries the most common endpoints:

```bash
python3 subtitlescout/scripts/bazarrctl.py search-episode <episode_id>
```

If that fails, use the generic caller:

```bash
python3 subtitlescout/scripts/bazarrctl.py call GET /api/<endpoint> --param k=v
```

### 4) Download subtitles for a specific file

#### Episode (auto-best match)

```bash
python3 subtitlescout/scripts/bazarrctl.py download-episode "/path/to/Episode.mkv" --language eng
```

#### Movie (auto-best match)

```bash
python3 subtitlescout/scripts/bazarrctl.py download-movie "/path/to/Movie.mkv" --language eng
```

Optional flags:
- `--hi` (hearing impaired)
- `--forced`
- `--providers opensubtitles subscene ...` (if supported by your Bazarr)

### 5) Manual-download a specific subtitle

Use a search endpoint to obtain a `subtitle` selection payload/id, then:

```bash
python3 subtitlescout/scripts/bazarrctl.py manual-download-episode "/path/to/Episode.mkv" '<subtitle_payload_or_id>' --language eng
```

## Agent notes

- Prefer **status/health** first when diagnosing.
- For version differences or undocumented endpoints, use `call` instead of guessing.
- Keep outputs concise; if an endpoint returns a huge list, summarize and/or use `--limit`.
