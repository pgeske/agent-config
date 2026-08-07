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

    def run_autoreview(self, *extra: str) -> list[str]:
        capture = self.root / "codex-args.json"
        env = os.environ.copy()
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
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        return json.loads(capture.read_text())

    def test_codex_user_config_is_ignored_by_default(self) -> None:
        self.assertIn("--ignore-user-config", self.run_autoreview())

    def test_codex_user_config_can_be_enabled_explicitly(self) -> None:
        self.assertNotIn("--ignore-user-config", self.run_autoreview("--codex-user-config"))


if __name__ == "__main__":
    unittest.main()
