import base64
import json
import time
import uuid
from pathlib import Path

import pytest
from conftest import ROOT

import cli_bridge

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 20).decode()
SID = "77777777-7777-7777-7777-777777777777"


@pytest.fixture
def cli(tmp_path, monkeypatch):
    for d in (cli_bridge._cache, cli_bridge._jobs, cli_bridge._busy):
        d.clear()
    ws = tmp_path / "ws"
    (ws / "proj").mkdir(parents=True)
    log = tmp_path / "fake.log"
    monkeypatch.setenv("CLAUDE_BIN", str(ROOT / "tests" / "fake_claude.py"))
    monkeypatch.setenv("FAKE_LOG", str(log))
    monkeypatch.delenv("FAKE_AUTH", raising=False)
    cli_bridge.config_path().write_text(json.dumps({"workspace_roots": [str(ws)], "models": ["claude-opus-5-5"]}), encoding="utf-8")
    proj = Path(str(tmp_path / "claude-home" / "projects" / "C--ws-proj"))
    proj.mkdir(parents=True)
    (proj / f"{SID}.jsonl").write_text(json.dumps({"type": "user", "uuid": "u1", "timestamp": "2026-01-01T00:00:00Z",
                                                   "cwd": str(ws / "proj"), "message": {"content": "oi"}}) + "\n", encoding="utf-8")
    return {"ws": ws, "log": log}


def calls(log):
    return [json.loads(x) for x in log.read_text("utf-8").splitlines()] if log.exists() else []


def wait(job_id, secs=15):
    end = time.time() + secs
    while time.time() < end:
        j = cli_bridge._jobs[job_id]
        if not j["running"]:
            return cli_bridge.public(j)
        time.sleep(0.05)
    raise AssertionError("job não terminou")


def test_auth_classification(cli, monkeypatch):
    assert cli_bridge.auth_status(True)["state"] == "ok"
    monkeypatch.setenv("FAKE_AUTH", "none")
    assert cli_bridge.auth_status(True)["state"] == "absent"
    monkeypatch.setenv("FAKE_AUTH", "expired")
    a = cli_bridge.auth_status(True)
    assert a["state"] == "expired" and not a["logged_in"]
    st = cli_bridge.status(recheck=True)
    assert st["available"] and st["version"].startswith("9.9.9") and st["auth_state"] == "expired"
    assert str(cli["ws"]) in st["workspaces"] and str(cli["ws"] / "proj") in st["workspaces"]


def test_help_flags(cli):
    info = cli_bridge.cli_info()
    assert info["flags"]["--session-id"] and info["flags"]["--name"] and info["flags"]["--output-format"]
    assert info["modes"] == ["acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan"]


def test_new_session(cli):
    job = cli_bridge.new_session(str(cli["ws"] / "proj"), "ESPECIALISTA", "faça X", model="sonnet", look_seed="p-abc-123")
    done = wait(job["id"])
    assert done["error"] is None and "faça X" in done["output"] and "segredo" not in done["output"]
    c = calls(cli["log"])[-1]
    a = c["args"]
    sid = a[a.index("--session-id") + 1]
    uuid.UUID(sid)
    assert a[:1] == ["-p"] and a[a.index("-n") + 1] == "ESPECIALISTA" and a[a.index("--model") + 1] == "sonnet"
    assert a[a.index("--output-format") + 1] == "json" and "--permission-mode" not in a
    assert c["prompt"] == "faça X" and Path(c["cwd"]).resolve() == (cli["ws"] / "proj").resolve()
    names = cli_bridge.load_names()
    assert names[sid]["look_seed"] == "p-abc-123" and names[sid]["origin"] == "office" and names[sid]["title"] == "ESPECIALISTA"


def test_new_session_guards(cli, tmp_path):
    with pytest.raises(PermissionError):
        cli_bridge.new_session(str(tmp_path), "x", "y")
    with pytest.raises(ValueError):
        cli_bridge.new_session(str(cli["ws"]), "x", "y", model="gpt-9")
    with pytest.raises(ValueError):
        cli_bridge.new_session(str(cli["ws"]), "x", "y", model="$(rm -rf)")
    job = cli_bridge.new_session(str(cli["ws"]), "x", "y", look_seed='"><script>alert(1)</script>')
    wait(job["id"])
    assert all(v["look_seed"] is None for v in cli_bridge.load_names().values())


def test_plan_mode_and_prefix(cli, monkeypatch):
    wait(cli_bridge.send(SID, "planeje", plan=True)["id"])
    a = calls(cli["log"])[-1]["args"]
    assert a[:3] == ["-p", "-r", SID] and a[a.index("--permission-mode") + 1] == "plan"
    cli_bridge._cache["info"] = (time.time(), {**cli_bridge.cli_info(), "modes": ["auto"]})
    wait(cli_bridge.send(SID, "planeje", plan=True)["id"])
    c = calls(cli["log"])[-1]
    assert c["prompt"].startswith("[MODO PLANO]") and c["prompt"].endswith("Pedido:\nplaneje") and "--permission-mode" not in c["args"]


def test_images(cli):
    job = cli_bridge.send(SID, "veja", images=["data:image/png;base64," + PNG, PNG])
    wait(job["id"])
    p = calls(cli["log"])[-1]["prompt"]
    assert p.startswith("[Image 1: ") and "[Image 2: " in p and cli_bridge.IMAGE_NOTE in p and p.endswith("veja")
    saved = list(cli_bridge.images_dir().glob("office-*"))
    assert len(saved) == 2 and all(s.suffix == ".png" for s in saved)
    with pytest.raises(ValueError):
        cli_bridge.send(SID, "x", images=[PNG, base64.b64encode(b"MZ executavel").decode()])
    assert len(list(cli_bridge.images_dir().glob("office-*"))) == 2
    with pytest.raises(ValueError):
        cli_bridge.send(SID, "x", images=[PNG] * 6)
    wait(cli_bridge.send(SID, "", images=[PNG])["id"])
    assert calls(cli["log"])[-1]["prompt"].startswith("[Image 1: ")
    with pytest.raises(ValueError):
        cli_bridge.send(SID, "   ")


def test_one_run_per_session_and_cancel(cli, monkeypatch):
    monkeypatch.setenv("FAKE_SLEEP", "10")
    job = cli_bridge.send(SID, "demorado")
    with pytest.raises(RuntimeError):
        cli_bridge.send(SID, "outro")
    end = time.time() + 10
    while "_proc" not in cli_bridge._jobs[job["id"]] and time.time() < end:
        time.sleep(0.05)
    cli_bridge.cancel(job["id"])
    done = wait(job["id"], 10)
    assert done["cancelled"] and not done["running"]
    monkeypatch.setenv("FAKE_SLEEP", "0")
    wait(cli_bridge.send(SID, "de novo")["id"])
    with pytest.raises(LookupError):
        cli_bridge.cancel("nao-existe")


def test_errors_explained(cli, monkeypatch):
    monkeypatch.setenv("FAKE_MODE", "empty")
    done = wait(cli_bridge.send(SID, "x")["id"])
    assert "PERMITIR" in done["error"]
    monkeypatch.setenv("FAKE_AUTH", "none")
    cli_bridge._cache.pop("auth", None)
    with pytest.raises(RuntimeError, match="logado"):
        cli_bridge.send(SID, "x")
    with pytest.raises(ValueError):
        cli_bridge.send(f"{SID}::sub", "x")


def test_find_claude_without_appdata(tmp_path, monkeypatch):
    monkeypatch.delenv("CLAUDE_BIN", raising=False)
    monkeypatch.delenv("APPDATA", raising=False)
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    monkeypatch.setenv("PATH", "")
    cli_bridge.config_path().write_text("{}", encoding="utf-8")
    base = tmp_path / "AppData" / "Roaming" / "Claude" / "claude-code"
    for v in ("2.1.9", "2.1.299", "2.1.30"):
        (base / v / "h").mkdir(parents=True)
        (base / v / "h" / "claude.exe").write_bytes(b"")
    assert cli_bridge.find_claude() == str(base / "2.1.299" / "h" / "claude.exe")
    assert any(c["exists"] is False for c in [{"exists": Path(p).is_file()} for p in cli_bridge.claude_candidates()])


def test_unavailable_not_cached(tmp_path, monkeypatch):
    for d in (cli_bridge._cache,):
        d.clear()
    monkeypatch.setenv("CLAUDE_BIN", str(tmp_path / "nao-existe.exe"))
    monkeypatch.setattr(cli_bridge, "find_claude", lambda: None)
    assert cli_bridge.cli_info()["available"] is False
    assert "info" not in cli_bridge._cache


def test_usage_limits(cli, monkeypatch):
    r = cli_bridge.probe_limits()
    rows = r["rows"]
    assert [x["label"] for x in rows] == ["Sessão (5 h)", "Semana (7 dias)", "Semana (7 dias) · Opus"]
    assert rows[0]["percent"] == 23.5 and rows[0]["resets_at"] == 1893492000.0 and rows[1]["resets_at"] == 1893456000.0
    a = calls(cli["log"])
    assert not a  # /usage não grava no log de comandos do modelo
    monkeypatch.setenv("FAKE_USAGE", "none")
    assert "não devolveu" in cli_bridge.probe_limits()["reason"]
    monkeypatch.setenv("FAKE_USAGE", "null")
    assert cli_bridge.probe_limits()["rows"] == []
    monkeypatch.setenv("FAKE_AUTH", "none")
    cli_bridge._cache.pop("auth", None)
    assert "sem login" in cli_bridge.probe_limits()["reason"]


def test_limits_snapshot_background(cli):
    cli_bridge._limits.update(data=None, running=False)
    first = cli_bridge.limits_snapshot()
    assert first["rows"] == [] and first["refreshing"]
    end = time.time() + 15
    while cli_bridge._limits["running"] and time.time() < end:
        time.sleep(0.05)
    snap = cli_bridge.limits_snapshot()
    assert len(snap["rows"]) == 3 and not snap["refreshing"] and snap["fetched_at"]
    cli_bridge._limits["data"]["rows"][0]["resets_at"] = time.time() - 5
    assert cli_bridge.limits_snapshot()["rows"][0]["reset_passed"] is True
