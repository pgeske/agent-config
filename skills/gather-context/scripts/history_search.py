#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Search shell history for likely prior commands.")
    parser.add_argument("query", help="Case-insensitive substring to search for")
    parser.add_argument("--history-file", action="append", dest="history_files", default=[], help="History file to search")
    parser.add_argument("--limit", type=int, default=10, help="Maximum matches to return")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text")
    return parser.parse_args()


def candidate_history_files(history_files: list[str]) -> list[Path]:
    if history_files:
        candidates = [Path(path).expanduser() for path in history_files]
    else:
        home = Path.home()
        candidates = [
            home / ".zsh_history",
            home / ".bash_history",
            home / ".zhistory",
            home / ".histfile",
        ]

    return [path for path in candidates if path.is_file()]


def extract_command(raw_line: str) -> str:
    line = raw_line.rstrip("\n")
    if line.startswith(": ") and ";" in line:
        return line.split(";", 1)[1].strip()
    return line.strip()


def search_history(query: str, files: list[Path], limit: int) -> list[dict[str, object]]:
    needle = query.casefold()
    matches: list[dict[str, object]] = []

    for path in files:
        with path.open(encoding="utf-8", errors="replace") as handle:
            for line_number, raw_line in enumerate(handle, start=1):
                command = extract_command(raw_line)
                if not command:
                    continue
                if needle not in command.casefold():
                    continue
                matches.append(
                    {
                        "path": str(path),
                        "line_number": line_number,
                        "command": command,
                    }
                )

    matches.sort(key=lambda item: (item["path"], item["line_number"]), reverse=True)
    return matches[: max(limit, 0)]


def main() -> int:
    args = parse_args()
    files = candidate_history_files(args.history_files)
    matches = search_history(args.query, files, args.limit)

    if args.json:
        print(json.dumps(matches, indent=2))
        return 0

    for match in matches:
        print(f'{match["path"]}:{match["line_number"]}: {match["command"]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
