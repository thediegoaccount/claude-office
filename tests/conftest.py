import os
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
FIXTURES = Path(__file__).parent / "fixtures" / "projects"
NOW = datetime(2026, 1, 15, 12, 1, 0, tzinfo=UTC).timestamp()


@pytest.fixture
def projects(tmp_path):
    import office

    office._CACHE.clear()
    dst = tmp_path / "projects"
    shutil.copytree(FIXTURES, dst)
    for f in dst.rglob("*.jsonl"):
        os.utime(f, (NOW - 30, NOW - 30))
    return dst


@pytest.fixture(autouse=True)
def isolated_env(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAUDE_OFFICE_TMP", str(tmp_path / "tmp"))
    monkeypatch.setenv("CLAUDE_OFFICE_CONFIG", str(tmp_path / "office.config.json"))
    monkeypatch.setenv("CLAUDE_OFFICE_NAMES", str(tmp_path / "office_names.json"))
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "claude-home"))
    monkeypatch.setenv("CLAUDE_BIN", str(ROOT / "tests" / "fake_claude.py"))
    import cli_bridge

    cli_bridge._cache.clear()
    cli_bridge._limits.update(data=None, running=False)
