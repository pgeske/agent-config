"""Tests for timeout profile relationships."""

import importlib.util
import unittest
from pathlib import Path


def _load_last30days_module():
    script_path = Path(__file__).parent.parent / "scripts" / "last30days.py"
    spec = importlib.util.spec_from_file_location("last30days_script", script_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


last30days = _load_last30days_module()


class TestTimeoutProfiles(unittest.TestCase):
    def test_quick_reddit_budget_handles_codex_latency(self):
        self.assertGreaterEqual(last30days.TIMEOUT_PROFILES["quick"]["reddit_future"], 120)

    def test_quick_global_timeout_exceeds_reddit_budget(self):
        quick = last30days.TIMEOUT_PROFILES["quick"]
        self.assertGreater(quick["global"], quick["reddit_future"])


if __name__ == "__main__":
    unittest.main()
