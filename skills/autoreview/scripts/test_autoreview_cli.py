#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("autoreview")


class CodexConfigIsolationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory(prefix="autoreview-cli-test.")
        self.root = Path(self.tempdir.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        subprocess.run(["git", "init", "--quiet"], cwd=self.repo, check=True)
        subprocess.run(["git", "config", "user.name", "Autoreview Test"], cwd=self.repo, check=True)
        subprocess.run(["git", "config", "user.email", "autoreview@example.com"], cwd=self.repo, check=True)
        # Fixture commits must not inherit the user's signing agent or editor.
        subprocess.run(["git", "config", "commit.gpgsign", "false"], cwd=self.repo, check=True)
        (self.repo / "app.py").write_text("value = 1\n")
        subprocess.run(["git", "add", "app.py"], cwd=self.repo, check=True)
        subprocess.run(["git", "commit", "--quiet", "-m", "initial"], cwd=self.repo, check=True)
        (self.repo / "app.py").write_text("value = 2\n")

        self.fake_codex = self.root / "fake-codex"
        self.fake_codex.write_text(
            """#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

args = sys.argv[1:]
Path(os.environ["AUTOREVIEW_CAPTURE"]).write_text(json.dumps(args))
output = Path(args[args.index("--output-last-message") + 1])
output.write_text(json.dumps({
    "findings": [],
    "overall_correctness": "patch is correct",
    "overall_explanation": "fake review completed",
    "overall_confidence": 1.0,
}))
"""
        )
        self.fake_codex.chmod(self.fake_codex.stat().st_mode | stat.S_IXUSR)

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def run_autoreview(self, *extra: str, expected_error: str | None = None) -> list[str]:
        capture = self.root / "codex-args.json"
        capture.unlink(missing_ok=True)
        env = {key: value for key, value in os.environ.items() if not key.startswith("AUTOREVIEW_")}
        env["AUTOREVIEW_CAPTURE"] = str(capture)
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--mode",
                "local",
                "--codex-bin",
                str(self.fake_codex),
                "--no-web-search",
                *extra,
            ],
            cwd=self.repo,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if expected_error is not None:
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(expected_error, result.stderr)
            self.assertFalse(capture.exists(), "invalid input must not launch a reviewer")
            return []
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        return json.loads(capture.read_text())

    def test_codex_user_config_is_ignored_by_default(self) -> None:
        self.assertIn("--ignore-user-config", self.run_autoreview())

    def test_codex_user_config_can_be_enabled_explicitly(self) -> None:
        self.assertNotIn("--ignore-user-config", self.run_autoreview("--codex-user-config"))

    def test_default_reviewer_uses_sol_xhigh_with_native_auth(self) -> None:
        args = self.run_autoreview()
        self.assertEqual(args[args.index("--model") + 1], "gpt-5.6-sol")
        self.assertIn('model_reasoning_effort="xhigh"', args)
        self.assertFalse(any(value.startswith("model_provider=") for value in args))
        self.assertFalse(any("auth.command=" in value for value in args))
        self.assertIn("features.multi_agent=false", args)
        self.assertEqual(args[args.index("-s") + 1], "read-only")

    def test_explicit_model_and_thinking_override_defaults(self) -> None:
        args = self.run_autoreview("--model", "custom-model", "--thinking", "high")
        self.assertEqual(args[args.index("--model") + 1], "custom-model")
        self.assertIn('model_reasoning_effort="high"', args)
        self.assertNotIn('model_reasoning_effort="xhigh"', args)

    def test_inline_reviewer_model_and_max_are_preserved(self) -> None:
        args = self.run_autoreview("--reviewers", "codex:custom-model:max")
        self.assertEqual(args[args.index("--model") + 1], "custom-model")
        self.assertIn('model_reasoning_effort="max"', args)

    def test_native_codex_auth_can_be_selected_explicitly(self) -> None:
        args = self.run_autoreview("--codex-config", "none", "--model", "gpt-5.6-sol")
        self.assertFalse(any(value.startswith("model_provider=") for value in args))
        self.assertIn("--ignore-user-config", args)

    def test_custom_codex_config_can_be_selected_explicitly(self) -> None:
        config = self.root / "codex-config.json"
        config.write_text(json.dumps({"model_provider": "test", "model_providers.test.name": "Test provider"}))
        args = self.run_autoreview("--codex-config", str(config))
        self.assertIn('model_provider="test"', args)
        self.assertFalse(any("auth.command=" in value for value in args))

    def test_invalid_codex_config_does_not_launch_reviewer(self) -> None:
        config = self.root / "codex-config.json"
        config.write_text(json.dumps({"model_providers": {"test": {}}}))
        self.run_autoreview("--codex-config", str(config), expected_error="flat -c settings")

    def test_empty_local_diff_is_not_reported_as_clean(self) -> None:
        (self.repo / "app.py").write_text("value = 1\n")
        self.run_autoreview(expected_error="no changes to review")

    def test_empty_branch_diff_does_not_launch_reviewer(self) -> None:
        self.run_autoreview("--mode", "branch", "--base", "HEAD", expected_error="no changes to review")


if __name__ == "__main__":
    unittest.main()
