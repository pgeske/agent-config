#!/usr/bin/env python3

import argparse
import json
import re
from pathlib import Path


SKIP_DIRS = {".git", ".obsidian", ".sisyphus", ".trash"}
TEXT_SUFFIXES = {".md", ".txt", ".text"}
MATCH_SCORES = {
    "title": 120,
    "alias": 110,
    "filename": 100,
    "tag": 90,
    "path": 80,
    "content": 70,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search the user's notes vault for relevant context.")
    parser.add_argument("query", help="Case-insensitive substring to search for")
    parser.add_argument("--notes-root", help="Override notes root")
    parser.add_argument("--tag", action="append", default=[], help="Require a tag like 'obsidian' or '#work'")
    parser.add_argument("--limit", type=int, default=20, help="Maximum matches to return")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text")
    return parser.parse_args()


def detect_notes_root(notes_root: str | None) -> Path:
    if notes_root:
        return Path(notes_root).expanduser()

    home = Path.home()
    preferred = home / "Notes"
    fallback = home / "notes"
    if preferred.is_dir():
        return preferred
    return fallback


def normalize_tag(tag: str) -> str:
    tag = tag.strip()
    if not tag:
        return tag
    return tag if tag.startswith("#") else f"#{tag}"


def normalize_text(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", " ", value.casefold())
    return " ".join(normalized.split())


def query_matches(query: str, candidate: str) -> bool:
    query_normalized = normalize_text(query)
    candidate_normalized = normalize_text(candidate)
    if not query_normalized or not candidate_normalized:
        return False
    return query_normalized in candidate_normalized


def parse_frontmatter(lines: list[str]) -> tuple[dict[str, list[str]], int]:
    if not lines or lines[0].strip() != "---":
        return {}, 0

    values: dict[str, list[str]] = {}
    current_key = ""

    for index, line in enumerate(lines[1:], start=1):
        stripped = line.strip()
        if stripped == "---":
            return values, index + 1
        if not stripped:
            continue

        key_match = re.match(r"([A-Za-z0-9_-]+):\s*(.*)", stripped)
        if key_match:
            current_key = key_match.group(1).casefold()
            raw_value = key_match.group(2).strip()
            values.setdefault(current_key, [])
            if raw_value:
                values[current_key].extend(parse_frontmatter_value(raw_value))
            continue

        if stripped.startswith("- ") and current_key:
            values.setdefault(current_key, []).append(clean_value(stripped[2:]))

    return {}, 0


def clean_value(value: str) -> str:
    return value.strip().strip('"\'')


def parse_frontmatter_value(raw_value: str) -> list[str]:
    value = raw_value.strip()
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [clean_value(part) for part in inner.split(",") if clean_value(part)]
    return [clean_value(value)]


def find_title(lines: list[str], start_index: int) -> tuple[int | None, str]:
    for line_number, line in enumerate(lines[start_index:], start=start_index + 1):
        stripped = line.strip()
        if stripped.startswith("#"):
            return line_number, stripped.lstrip("#").strip()
    return None, ""


def find_inline_tags(lines: list[str], start_index: int) -> list[tuple[int, str]]:
    tags: list[tuple[int, str]] = []
    for line_number, line in enumerate(lines[start_index:], start=start_index + 1):
        stripped = line.strip()
        if not stripped.casefold().startswith("tags:"):
            continue
        for tag in stripped.split(":", 1)[1].split():
            cleaned = clean_value(tag)
            if cleaned:
                tags.append((line_number, cleaned))
    return tags


def append_match(matches: list[dict[str, object]], seen: set[tuple[str, str, int | None, str]], *, path: Path, match_type: str, text: str, line_number: int | None = None) -> None:
    key = (str(path), match_type, line_number, text)
    if key in seen:
        return
    seen.add(key)
    matches.append(
        {
            "path": str(path),
            "line_number": line_number,
            "line": text,
            "match_type": match_type,
            "score": MATCH_SCORES[match_type],
        }
    )


def iter_note_files(root: Path):
    if not root.is_dir():
        return

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        yield path


def search_notes(root: Path, query: str, tags: list[str], limit: int) -> list[dict[str, object]]:
    required_tags = [normalize_tag(tag).casefold() for tag in tags if tag.strip()]
    matches: list[dict[str, object]] = []
    seen: set[tuple[str, str, int | None, str]] = set()

    for path in iter_note_files(root):
        text = path.read_text(encoding="utf-8", errors="replace")
        lowered = text.casefold()
        if any(tag not in lowered for tag in required_tags):
            continue

        relative_path = str(path.relative_to(root))
        lines = text.splitlines()
        frontmatter, body_start = parse_frontmatter(lines)

        if query_matches(query, path.name):
            append_match(matches, seen, path=path, match_type="filename", text=path.name)

        if query_matches(query, relative_path):
            append_match(matches, seen, path=path, match_type="path", text=relative_path)

        title_line, title = find_title(lines, body_start)
        if title and query_matches(query, title):
            append_match(matches, seen, path=path, match_type="title", text=f"# {title}", line_number=title_line)

        for alias in frontmatter.get("aliases", []) + frontmatter.get("alias", []):
            if query_matches(query, alias):
                append_match(matches, seen, path=path, match_type="alias", text=alias)

        frontmatter_tags = frontmatter.get("tags", []) + frontmatter.get("tag", [])
        inline_tags = [tag for _, tag in find_inline_tags(lines, body_start)]
        for tag in frontmatter_tags + inline_tags:
            if query_matches(query, tag):
                append_match(matches, seen, path=path, match_type="tag", text=tag)

        for line_number, line in enumerate(lines[body_start:], start=body_start + 1):
            stripped = line.strip()
            if not stripped:
                continue
            if title_line is not None and line_number == title_line:
                continue
            if not query_matches(query, stripped):
                continue
            append_match(matches, seen, path=path, match_type="content", text=stripped, line_number=line_number)

    matches.sort(key=lambda item: (-int(item["score"]), str(item["path"]), int(item["line_number"] or 0)))
    return matches[: max(limit, 0)]


def main() -> int:
    args = parse_args()
    root = detect_notes_root(args.notes_root)
    matches = search_notes(root, args.query, args.tag, args.limit)

    if args.json:
        print(json.dumps(matches, indent=2))
        return 0

    for match in matches:
        line_number = match["line_number"] if match["line_number"] is not None else "-"
        print(f'{match["path"]}:{line_number}: [{match["match_type"]}] {match["line"]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
