#!/usr/bin/env python3
"""bazarrctl - tiny Bazarr API wrapper used by the OpenClaw `subtitlescout` skill.

Design goals:
- No API key printed to stdout/stderr.
- Simple subcommands for common, *safe* operations.
- A generic `call` escape hatch for endpoints that differ by Bazarr version.

Auth:
- Env: BAZARR_URL, BAZARR_API_KEY
- Or flags: --url, --api-key

Notes:
Bazarr's API is not formally documented and endpoints can vary by version.
This wrapper implements common endpoints plus a generic caller.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, Optional, Tuple

import requests

DEFAULT_TIMEOUT_S = 30


def eprint(*a: Any, **k: Any) -> None:
    print(*a, file=sys.stderr, **k)


def get_cfg(args: argparse.Namespace) -> Tuple[str, str]:
    url = (args.url or os.environ.get("BAZARR_URL") or "").strip()
    api_key = (args.api_key or os.environ.get("BAZARR_API_KEY") or "").strip()

    if not url:
        raise SystemExit("Missing Bazarr URL. Set BAZARR_URL or pass --url")
    if not api_key:
        raise SystemExit("Missing Bazarr API key. Set BAZARR_API_KEY or pass --api-key")

    return url.rstrip("/"), api_key


def request_json(
    base_url: str,
    api_key: str,
    method: str,
    path: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    form_body: Optional[Dict[str, Any]] = None,
    timeout_s: int = DEFAULT_TIMEOUT_S,
) -> Tuple[int, Any, str]:
    """Return (status_code, parsed_json_or_text, content_type)."""
    url = base_url + ("" if path.startswith("/") else "/") + path

    headers = {
        # Most Bazarr installs accept this header.
        "X-Api-Key": api_key,
        "Accept": "application/json, text/plain;q=0.9, */*;q=0.8",
    }

    # Some reverse proxies / auth setups expect apikey as query parameter.
    params = dict(params or {})
    if "apikey" not in params:
        params["apikey"] = api_key

    # Never log the key.
    try:
        r = requests.request(
            method.upper(),
            url,
            headers=headers,
            params=params,
            json=json_body,
            data=form_body,
            timeout=timeout_s,
        )
    except requests.RequestException as ex:
        raise SystemExit(f"Request failed: {ex}")

    ct = (r.headers.get("content-type") or "").split(";")[0].strip().lower()

    # Try JSON first if content-type hints it.
    if ct in ("application/json", "application/problem+json"):
        try:
            return r.status_code, r.json(), ct
        except ValueError:
            return r.status_code, r.text, ct

    # Fallback: attempt JSON anyway.
    try:
        return r.status_code, r.json(), ct
    except ValueError:
        return r.status_code, r.text, ct


def print_json(data: Any) -> None:
    print(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False))


def cmd_status(args: argparse.Namespace) -> int:
    base_url, api_key = get_cfg(args)
    code, data, _ = request_json(base_url, api_key, "GET", "/api/system/status")

    if code >= 400:
        eprint(f"HTTP {code}")
        # Avoid spewing HTML. Keep first 500 chars.
        if isinstance(data, str):
            eprint(data[:500])
        else:
            eprint(json.dumps(data)[:500])
        return 1

    # Print a sanitized subset if possible.
    if isinstance(data, dict):
        keep = {
            k: data.get(k)
            for k in (
                "bazarr_version",
                "version",
                "python_version",
                "package",
                "platform",
                "branch",
                "database",
                "path",
                "sonarr",
                "radarr",
            )
            if k in data
        }
        print_json(keep if keep else data)
    else:
        print(data)
    return 0


def cmd_health(args: argparse.Namespace) -> int:
    base_url, api_key = get_cfg(args)
    code, data, _ = request_json(base_url, api_key, "GET", "/api/system/health")
    if code >= 400:
        eprint(f"HTTP {code}")
        eprint(str(data)[:500])
        return 1
    print_json(data)
    return 0


def cmd_list_series(args: argparse.Namespace) -> int:
    base_url, api_key = get_cfg(args)
    code, data, _ = request_json(base_url, api_key, "GET", "/api/series")
    if code >= 400:
        eprint(f"HTTP {code}")
        eprint(str(data)[:500])
        return 1

    if not isinstance(data, list):
        print_json(data)
        return 0

    # Summarize; avoid huge dumps by default.
    out = []
    for s in data[: args.limit]:
        if not isinstance(s, dict):
            continue
        out.append(
            {
                "title": s.get("title"),
                "sonarrSeriesId": s.get("sonarrSeriesId") or s.get("sonarr_series_id"),
                "tvdbId": s.get("tvdbId") or s.get("tvdb_id"),
                "path": s.get("path"),
                "subtitles": s.get("subtitles"),
            }
        )
    print_json(out)
    return 0


def cmd_list_movies(args: argparse.Namespace) -> int:
    base_url, api_key = get_cfg(args)
    code, data, _ = request_json(base_url, api_key, "GET", "/api/movies")
    if code >= 400:
        eprint(f"HTTP {code}")
        eprint(str(data)[:500])
        return 1

    if not isinstance(data, list):
        print_json(data)
        return 0

    out = []
    for m in data[: args.limit]:
        if not isinstance(m, dict):
            continue
        out.append(
            {
                "title": m.get("title"),
                "radarrId": m.get("radarrId") or m.get("radarr_id"),
                "tmdbId": m.get("tmdbId") or m.get("tmdb_id"),
                "path": m.get("path"),
                "subtitles": m.get("subtitles"),
            }
        )
    print_json(out)
    return 0


def post_with_json_then_form(
    base_url: str,
    api_key: str,
    path: str,
    payload: Dict[str, Any],
) -> Tuple[int, Any]:
    code, data, _ = request_json(base_url, api_key, "POST", path, json_body=payload)

    # Some Bazarr builds expect form-encoded bodies.
    if code in (400, 415) and not (isinstance(data, dict) and data):
        code2, data2, _ = request_json(base_url, api_key, "POST", path, form_body=payload)
        return code2, data2

    return code, data


def cmd_search_episode(args: argparse.Namespace) -> int:
    """Attempt to search for subtitles for an episode.

    Endpoint differs by version. We try the most common patterns and report whichever works.
    """
    base_url, api_key = get_cfg(args)

    candidates = [
        ("GET", f"/api/episodes/subtitles", {"episodeid": args.episode_id}),
        ("GET", f"/api/episodes_subtitles", {"episodeid": args.episode_id}),
    ]

    for method, path, params in candidates:
        code, data, _ = request_json(base_url, api_key, method, path, params=params)
        if code < 400:
            print_json({"endpoint": path, "result": data})
            return 0

    eprint("No known subtitle-search endpoint succeeded for this Bazarr instance.")
    eprint("Try: bazarrctl.py call GET /api/<endpoint> ...")
    return 2


def cmd_download_episode(args: argparse.Namespace) -> int:
    base_url, api_key = get_cfg(args)
    payload: Dict[str, Any] = {
        # Bazarr expects an episode path for these classic endpoints.
        "episodePath": args.episode_path,
        "language": args.language,
        "audio_language": args.audio_language or "",
        "hi": "true" if args.hi else "false",
        "forced": "true" if args.forced else "false",
        "sceneName": args.scene_name or "",
    }

    # Prefer provider list if given.
    if args.providers:
        payload["providers_list"] = ",".join(args.providers)

    code, data = post_with_json_then_form(base_url, api_key, "/api/episodes_subtitles_download", payload)
    if code >= 400:
        eprint(f"HTTP {code}")
        eprint(str(data)[:800])
        return 1
    print_json(data)
    return 0


def cmd_manual_download_episode(args: argparse.Namespace) -> int:
    base_url, api_key = get_cfg(args)
    payload: Dict[str, Any] = {
        "episodePath": args.episode_path,
        "language": args.language,
        "audio_language": args.audio_language or "",
        "hi": "true" if args.hi else "false",
        "forced": "true" if args.forced else "false",
        # Bazarr uses `subtitle` to pass the selected subtitle payload/id.
        "subtitle": args.subtitle,
    }

    code, data = post_with_json_then_form(base_url, api_key, "/api/episodes_subtitles_manual_download", payload)
    if code >= 400:
        eprint(f"HTTP {code}")
        eprint(str(data)[:800])
        return 1
    print_json(data)
    return 0


def cmd_download_movie(args: argparse.Namespace) -> int:
    base_url, api_key = get_cfg(args)
    payload: Dict[str, Any] = {
        "moviePath": args.movie_path,
        "language": args.language,
        "audio_language": args.audio_language or "",
        "hi": "true" if args.hi else "false",
        "forced": "true" if args.forced else "false",
        "sceneName": args.scene_name or "",
    }
    if args.providers:
        payload["providers_list"] = ",".join(args.providers)

    code, data = post_with_json_then_form(base_url, api_key, "/api/movies_subtitles_download", payload)
    if code >= 400:
        eprint(f"HTTP {code}")
        eprint(str(data)[:800])
        return 1
    print_json(data)
    return 0


def cmd_call(args: argparse.Namespace) -> int:
    base_url, api_key = get_cfg(args)

    params = dict(p.split("=", 1) for p in (args.param or []))
    json_body = json.loads(args.json) if args.json else None

    code, data, ct = request_json(
        base_url,
        api_key,
        args.method,
        args.path,
        params=params or None,
        json_body=json_body,
    )
    if args.show_meta:
        print_json({"http": code, "content_type": ct, "data": data})
    else:
        if isinstance(data, (dict, list)):
            print_json(data)
        else:
            print(str(data))
    return 0 if code < 400 else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="bazarrctl.py", add_help=True)
    p.add_argument("--url", help="Bazarr base URL (or set BAZARR_URL)")
    p.add_argument("--api-key", dest="api_key", help="Bazarr API key (or set BAZARR_API_KEY)")

    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("status", help="Get Bazarr system status")
    sp.set_defaults(func=cmd_status)

    sp = sub.add_parser("health", help="Get Bazarr system health")
    sp.set_defaults(func=cmd_health)

    sp = sub.add_parser("list-series", help="List series known to Bazarr")
    sp.add_argument("--limit", type=int, default=25, help="Max items to print (default: 25)")
    sp.set_defaults(func=cmd_list_series)

    sp = sub.add_parser("list-movies", help="List movies known to Bazarr")
    sp.add_argument("--limit", type=int, default=25, help="Max items to print (default: 25)")
    sp.set_defaults(func=cmd_list_movies)

    sp = sub.add_parser("search-episode", help="Search for subtitles for an episode id (best-effort)")
    sp.add_argument("episode_id", help="Bazarr episode id")
    sp.set_defaults(func=cmd_search_episode)

    sp = sub.add_parser("download-episode", help="Auto-download best subtitle match for an episode file")
    sp.add_argument("episode_path", help="Full path to the episode file as Bazarr sees it")
    sp.add_argument("--language", default="eng", help="Subtitle language code (default: eng)")
    sp.add_argument("--audio-language", default="", help="Audio language code (optional)")
    sp.add_argument("--hi", action="store_true", help="Prefer hearing-impaired subtitles")
    sp.add_argument("--forced", action="store_true", help="Prefer forced subtitles")
    sp.add_argument("--scene-name", default="", help="Optional scene name override")
    sp.add_argument("--providers", nargs="*", default=None, help="Optional providers list")
    sp.set_defaults(func=cmd_download_episode)

    sp = sub.add_parser("manual-download-episode", help="Manual-download a specific subtitle for an episode file")
    sp.add_argument("episode_path", help="Full path to the episode file as Bazarr sees it")
    sp.add_argument("subtitle", help="Subtitle selection payload/id (as returned by search endpoints)")
    sp.add_argument("--language", default="eng", help="Subtitle language code (default: eng)")
    sp.add_argument("--audio-language", default="", help="Audio language code (optional)")
    sp.add_argument("--hi", action="store_true", help="Hearing-impaired")
    sp.add_argument("--forced", action="store_true", help="Forced")
    sp.set_defaults(func=cmd_manual_download_episode)

    sp = sub.add_parser("download-movie", help="Auto-download best subtitle match for a movie file")
    sp.add_argument("movie_path", help="Full path to the movie file as Bazarr sees it")
    sp.add_argument("--language", default="eng", help="Subtitle language code (default: eng)")
    sp.add_argument("--audio-language", default="", help="Audio language code (optional)")
    sp.add_argument("--hi", action="store_true", help="Hearing-impaired")
    sp.add_argument("--forced", action="store_true", help="Forced")
    sp.add_argument("--scene-name", default="", help="Optional scene name override")
    sp.add_argument("--providers", nargs="*", default=None, help="Optional providers list")
    sp.set_defaults(func=cmd_download_movie)

    sp = sub.add_parser("call", help="Generic API caller (escape hatch)")
    sp.add_argument("method", help="HTTP method (GET/POST/PUT/DELETE)")
    sp.add_argument("path", help="Path like /api/system/status")
    sp.add_argument("--param", action="append", help="Query param k=v (repeatable)")
    sp.add_argument("--json", help="JSON request body as a string")
    sp.add_argument("--show-meta", action="store_true", help="Include http code and content-type")
    sp.set_defaults(func=cmd_call)

    return p


def main() -> int:
    p = build_parser()
    args = p.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
