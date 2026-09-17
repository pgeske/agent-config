#!/usr/bin/env python3
"""Resolve machine-local coordinator storage; create directories only with --init."""

import argparse
import json
import os
from pathlib import Path
import sys


def resolve_root():
    configured = os.environ.get("COORDINATOR_NOTES_DIR", "").strip()
    source = "COORDINATOR_NOTES_DIR"
    if not configured:
        config_path = Path.home() / ".config/coordinator-memory/config.json"
        source = str(config_path)
        if not config_path.is_file():
            raise ValueError(
                "No notes directory configured. Ask the user where to keep this "
                "machine's coordinator notes, then set COORDINATOR_NOTES_DIR or "
                f'create {config_path} with {{"notes_dir": "/absolute/path"}}.'
            )
        config = json.loads(config_path.read_text())
        if not isinstance(config, dict):
            raise ValueError("Coordinator configuration must be a JSON object.")
        configured = config.get("notes_dir")
    if not isinstance(configured, str) or not configured.strip():
        raise ValueError("notes_dir must be a nonempty path string.")
    root = Path(configured.strip()).expanduser()
    if not root.is_absolute():
        raise ValueError("The notes directory must be absolute (or start with ~/).")
    root = root.resolve()
    if root.exists() and not root.is_dir():
        raise ValueError(f"The notes directory is a file: {root}")
    return root, source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--init", action="store_true", help="Create missing storage directories")
    args = parser.parse_args()
    try:
        root, source = resolve_root()
        if args.init:
            for directory in (root, root / "daily", root / "workers"):
                directory.mkdir(parents=True, exist_ok=True)
        print(json.dumps({"root": str(root), "source": source, "exists": root.is_dir()}))
    except (ValueError, OSError) as error:
        print(f"Coordinator memory: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
