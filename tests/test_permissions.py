import json
import subprocess
import sys
import threading
import time

import pytest
from conftest import ROOT

import permissions

HOOK = ROOT / "hooks" / "office_permission.py"


def make_request(pid="a" * 32, expires_in=30, tool="Bash", inp=None):
    d = permissions.pending_dir()
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{pid}.json").write_text(json.dumps({"id": pid, "session_id": "s1", "tool_name": tool,
                                               "tool_input": inp or {"command": "git push --token=abc"},
                                               "created": time.time(), "expires": time.time() + expires_in}), encoding="utf-8")
    return pid


def test_list_and_decide():
    pid = make_request()
    make_request("b" * 32, expires_in=-1)
    make_request("c" * 32, expires_in=10)
    lst = permissions.list_pending()
    assert [p["id"] for p in lst] == ["c" * 32, pid]
    assert lst[1]["text"].startswith("git push") and "abc" not in lst[1]["detail"]
    assert permissions.decide(pid, "approve")["ok"]
    assert (permissions.pending_dir() / f"{pid}.decision").read_text() == "approve"
    assert pid not in [p["id"] for p in permissions.list_pending()]
    with pytest.raises(ValueError):
        permissions.decide("../x", "approve")
    with pytest.raises(ValueError):
        permissions.decide("c" * 32, "deny")
    with pytest.raises(LookupError):
        permissions.decide("d" * 32, "approve")


def run_hook(env_extra, decide=None, timeout=15):
    import os

    env = {**os.environ, **env_extra}
    payload = json.dumps({"session_id": "s1", "tool_use_id": "tu1", "tool_name": "Bash", "tool_input": {"command": "ls"}})
    proc = subprocess.Popen([sys.executable, str(HOOK)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=env)
    proc.stdin.write(payload.encode())
    proc.stdin.close()
    if decide:
        def go():
            for _ in range(100):
                lst = permissions.list_pending()
                if lst:
                    permissions.decide(lst[0]["id"], decide)
                    return
                time.sleep(0.1)
        threading.Thread(target=go, daemon=True).start()
    out = proc.stdout.read().decode()
    proc.wait(timeout)
    return proc.returncode, out


def test_hook_approve_skip_and_closed_office(monkeypatch):
    env = {"CLAUDE_OFFICE_TMP": str(permissions.tmp_dir()), "OFFICE_WAIT_SECONDS": "5"}
    code, out = run_hook(env)
    assert code == 0 and out == ""  # sem servidor aberto: segue o fluxo normal na hora
    permissions.heartbeat()
    code, out = run_hook(env, "approve")
    assert code == 0 and json.loads(out)["hookSpecificOutput"]["decision"]["behavior"] == "allow"
    permissions.heartbeat()
    code, out = run_hook(env, "skip")
    assert code == 0 and out == ""
    assert not list(permissions.pending_dir().glob("*"))
    assert "decisão approve" in (permissions.tmp_dir() / "office_permission.log").read_text("utf-8")


def test_install_hook_preserves_other_hooks(tmp_path, monkeypatch):
    sys.path.insert(0, str(ROOT / "scripts"))
    import hook_settings

    home = tmp_path / "claude-home"
    home.mkdir(exist_ok=True)
    other = {"matcher": "Bash", "hooks": [{"type": "command", "command": "echo outro"}]}
    (home / "settings.json").write_bytes(b"\xef\xbb\xbf" + json.dumps({"model": "opus", "hooks": {
        "PermissionRequest": [other], "Stop": [{"hooks": [{"type": "command", "command": "x"}]}]}}).encode())
    hook_settings.install()
    hook_settings.install()
    raw = (home / "settings.json").read_bytes()
    assert not raw.startswith(b"\xef\xbb\xbf")
    data = json.loads(raw)
    pr = data["hooks"]["PermissionRequest"]
    assert pr[0] == other and len(pr) == 2 and pr[1]["hooks"][0]["timeout"] == 45
    assert "office_permission.py" in pr[1]["hooks"][0]["command"] and data["model"] == "opus" and "Stop" in data["hooks"]
    assert (home / "hooks" / "office_permission.py").is_file()
    hook_settings.install(uninstall=True)
    data = json.loads((home / "settings.json").read_text("utf-8"))
    assert data["hooks"]["PermissionRequest"] == [other] and not (home / "hooks" / "office_permission.py").exists()
