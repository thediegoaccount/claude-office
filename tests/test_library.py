# ruff: noqa: DTZ001, DTZ006 - os agendamentos usam horário local
import json
import time
from datetime import datetime

import pytest
from conftest import ROOT

import cli_bridge
import library


@pytest.fixture
def lib(tmp_path, monkeypatch):
    for d in (cli_bridge._cache, cli_bridge._jobs, cli_bridge._busy):
        d.clear()
    ws = tmp_path / "ws"
    (ws / "proj").mkdir(parents=True)
    log = tmp_path / "fake.log"
    monkeypatch.setenv("CLAUDE_BIN", str(ROOT / "tests" / "fake_claude.py"))
    monkeypatch.setenv("FAKE_LOG", str(log))
    monkeypatch.delenv("FAKE_AUTH", raising=False)
    cli_bridge.config_path().write_text(json.dumps({"workspace_roots": [str(ws)], "models": ["claude-opus-5-5"]}), encoding="utf-8")
    return {"cwd": str(ws / "proj"), "log": log}


def wait_jobs():
    end = time.time() + 15
    while time.time() < end and any(j["running"] for j in cli_bridge._jobs.values()):
        time.sleep(0.05)


def test_save_validate_delete(lib):
    it = library.save({"name": "Relatório", "prompt": "gere o relatório", "cwd": lib["cwd"], "model": "claude-opus-5-5"})
    assert it["schedule"] == {"kind": "off"} and it["enabled"] is False and it["next_run"] is None and it["look_seed"]
    again = library.save({**it, "name": "Relatório diário"})
    assert again["id"] == it["id"] and again["look_seed"] == it["look_seed"] and len(library.items()) == 1
    for bad in ({"name": "", "prompt": "x", "cwd": lib["cwd"]}, {"name": "a", "prompt": "", "cwd": lib["cwd"]},
                {"name": "a", "prompt": "x", "cwd": lib["cwd"], "model": "inventado"},
                {"name": "a", "prompt": "x", "cwd": lib["cwd"], "schedule": {"kind": "daily", "time": "25:00", "days": [0]}},
                {"name": "a", "prompt": "x", "cwd": lib["cwd"], "schedule": {"kind": "daily", "time": "09:00", "days": []}},
                {"name": "a", "prompt": "x", "cwd": lib["cwd"], "schedule": {"kind": "interval", "every_minutes": 1}}):
        with pytest.raises(ValueError):
            library.save(bad)
    with pytest.raises(PermissionError):
        library.save({"name": "a", "prompt": "x", "cwd": "/"})
    library.delete(it["id"])
    assert library.items() == []
    with pytest.raises(LookupError):
        library.delete(it["id"])


def test_next_run():
    mon = datetime(2026, 11, 9, 8, 0).timestamp()  # segunda-feira
    daily = {"kind": "daily", "time": "09:30", "days": [0, 2]}
    assert datetime.fromtimestamp(library.next_run(daily, mon)) == datetime(2026, 11, 9, 9, 30)
    assert datetime.fromtimestamp(library.next_run(daily, mon + 2 * 3600)) == datetime(2026, 11, 11, 9, 30)
    assert datetime.fromtimestamp(library.next_run({"kind": "daily", "time": "07:00", "days": [0]}, mon)) == datetime(2026, 11, 16, 7, 0)
    assert library.next_run({"kind": "interval", "every_minutes": 30}, mon) == mon + 1800
    assert library.next_run({"kind": "off"}, mon) is None


def test_run_and_tick(lib):
    it = library.save({"name": "Ronda", "prompt": "verifique os testes", "cwd": lib["cwd"],
                       "schedule": {"kind": "interval", "every_minutes": 10}})
    assert it["enabled"] and it["next_run"] > time.time()
    assert library.tick() == []                                   # ainda não venceu
    assert library.tick(it["next_run"] + 5) == [it["id"]]         # venceu: dispara uma sessão nova
    wait_jobs()
    cur = library.items()[0]
    assert cur["runs"] == 1 and cur["last_error"] is None and cur["next_run"] > it["next_run"]
    call = [json.loads(x) for x in lib["log"].read_text("utf-8").splitlines() if '"-p"' in x][-1]
    assert "verifique os testes" in json.dumps(call, ensure_ascii=False)
    assert library.tick(cur["next_run"] + library.GRACE + 60) == []  # perdeu a janela: pula e avisa
    assert "pulada" in library.items()[0]["last_error"]
    library.save({**library.items()[0], "enabled": False})
    assert library.items()[0]["next_run"] is None and library.tick(time.time() + 10**6) == []
    library.run(it["id"])                                         # manual continua funcionando
    wait_jobs()
    assert library.items()[0]["runs"] == 2
