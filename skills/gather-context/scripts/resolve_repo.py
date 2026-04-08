#!/usr/bin/env python3

import argparse
import json
import subprocess
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Resolve a repo name to a likely local clone and GitHub repo.")
    parser.add_argument("query", help="Repo or topic to resolve")
    parser.add_argument("--projects-root", default="~/projects", help="Root directory that contains local repos")
    parser.add_argument("--gh-bin", default="gh", help="GitHub CLI binary to use")
    parser.add_argument("--gh-limit", type=int, default=200, help="Maximum GitHub repos to inspect")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text")
    return parser.parse_args()


def normalize(value: str) -> str:
    return "".join(ch for ch in value.casefold() if ch.isalnum())


def local_candidates(projects_root: Path) -> list[dict[str, object]]:
    if not projects_root.is_dir():
        return []

    candidates: list[dict[str, object]] = []
    for child in sorted(projects_root.iterdir()):
        if not child.is_dir():
            continue
        candidates.append({"name": child.name, "local_path": str(child), "source": "local"})
    return candidates


def github_candidates(gh_bin: str, gh_limit: int) -> list[dict[str, object]]:
    try:
        result = subprocess.run(
            [gh_bin, "repo", "list", "--limit", str(gh_limit), "--json", "name,nameWithOwner,isPrivate,url"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return []

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []

    candidates: list[dict[str, object]] = []
    for item in payload:
        candidates.append(
            {
                "name": item.get("name", ""),
                "name_with_owner": item.get("nameWithOwner", ""),
                "github_url": item.get("url", ""),
                "is_private": bool(item.get("isPrivate", False)),
                "source": "github",
            }
        )
    return candidates


def score_candidate(query: str, candidate_name: str) -> int:
    query_cf = query.casefold()
    name_cf = candidate_name.casefold()
    query_norm = normalize(query)
    name_norm = normalize(candidate_name)

    if query_cf == name_cf:
        return 100
    if query_norm and query_norm == name_norm:
        return 95
    if query_cf in name_cf:
        return 80
    if query_norm and query_norm in name_norm:
        return 75
    return 0


def best_local_match(query: str, locals_: list[dict[str, object]]) -> dict[str, object] | None:
    scored = []
    for candidate in locals_:
        score = score_candidate(query, str(candidate["name"]))
        if score > 0:
            scored.append(candidate | {"score": score})

    scored.sort(key=lambda item: (item["score"], item["name"]), reverse=True)
    return scored[0] if scored else None


def github_matches(query: str, remotes: list[dict[str, object]]) -> list[dict[str, object]]:
    scored = []
    for candidate in remotes:
        score = score_candidate(query, str(candidate["name"]))
        if score > 0:
            scored.append(candidate | {"score": score})

    scored.sort(key=lambda item: (item["score"], item["name"]), reverse=True)
    return scored


def attach_github_context(local_match: dict[str, object] | None, remote_matches: list[dict[str, object]]) -> dict[str, object] | None:
    if not local_match:
        return None

    normalized_local = normalize(str(local_match["name"]))
    for remote in remote_matches:
        if normalize(str(remote["name"])) != normalized_local:
            continue
        return local_match | {
            "github_url": remote.get("github_url", ""),
            "name_with_owner": remote.get("name_with_owner", ""),
            "is_private": remote.get("is_private", False),
        }
    return local_match | {"github_url": "", "name_with_owner": "", "is_private": False}


def resolve(query: str, projects_root: Path, gh_bin: str, gh_limit: int) -> dict[str, object]:
    locals_ = local_candidates(projects_root)
    remotes = github_candidates(gh_bin, gh_limit)
    best_local = best_local_match(query, locals_)
    remote_matches = github_matches(query, remotes)

    best_match = attach_github_context(best_local, remote_matches)
    if best_match is None and remote_matches:
        top_remote = remote_matches[0]
        best_match = {
            "source": "github",
            "name": top_remote["name"],
            "local_path": "",
            "github_url": top_remote.get("github_url", ""),
            "name_with_owner": top_remote.get("name_with_owner", ""),
            "is_private": top_remote.get("is_private", False),
            "score": top_remote["score"],
        }

    return {
        "query": query,
        "projects_root": str(projects_root),
        "best_match": best_match,
        "local_matches": [item for item in ([best_local] if best_local else [])],
        "github_matches": remote_matches[:5],
    }


def main() -> int:
    args = parse_args()
    result = resolve(args.query, Path(args.projects_root).expanduser(), args.gh_bin, args.gh_limit)

    if args.json:
        print(json.dumps(result, indent=2))
        return 0

    best = result["best_match"]
    if not best:
        print(f'No repo match found for {args.query}')
        return 0

    print(f'Source: {best["source"]}')
    print(f'Name: {best["name"]}')
    if best.get("local_path"):
        print(f'Local path: {best["local_path"]}')
    if best.get("github_url"):
        print(f'GitHub: {best["github_url"]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
