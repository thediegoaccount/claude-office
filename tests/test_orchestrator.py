import json
import time

import pytest
from conftest import ROOT

import cli_bridge
import orchestrator
import server


@pytest.fixture
def orch(tmp_path, monkeypatch):
    for d in (cli_bridge._cache, cli_bridge._jobs, cli_bridge._busy):
        d.clear()
    orchestrator._decisions.clear()
    ws = tmp_path / "ws"
    (ws / "proj").mkdir(parents=True)
    log = tmp_path / "fake.log"
    monkeypatch.setenv("CLAUDE_BIN", str(ROOT / "tests" / "fake_claude.py"))
    monkeypatch.setenv("FAKE_LOG", str(log))
    monkeypatch.delenv("FAKE_AUTH", raising=False)
    cli_bridge.config_path().write_text(json.dumps({"workspace_roots": [str(ws)], "models": ["claude-fable-5-1"]}), encoding="utf-8")
    return {"cwd": str(ws / "proj"), "log": log}


def finish(job):
    end = time.time() + 20
    while time.time() < end:
        j = cli_bridge._jobs[job["id"]]
        if not j["running"] and not any(x["running"] for x in cli_bridge._jobs.values()):
            return j
        time.sleep(0.05)
    raise AssertionError("não terminou")


def launches(log):
    return [json.loads(x) for x in log.read_text("utf-8").splitlines()] if log.exists() else []


def model_of(call):
    return call["args"][call["args"].index("--model") + 1] if "--model" in call["args"] else None


def test_menu_and_prompt():
    cfg = {"models": ["claude-fable-5-1"], "providers": {"gemini": {"api_key": "k", "models": ["g-flash"]}, "openai": {"models": ["gpt"]}}}
    assert orchestrator.menu(cfg) == ["gemini/g-flash", "haiku", "sonnet", "opus", "claude-fable-5-1"]  # sem chave fica de fora
    text = orchestrator.build_prompt(cfg, "explique JOIN", "opus")
    assert "explique JOIN" in text and "Modelo pedido pelo usuário: opus" in text and "2 a 4 partes" in text and "um tema por parte" in text


def test_parse_validates():
    allowed = {"haiku", "sonnet", "opus"}
    d = orchestrator.parse('claro! {"effort": 9, "model": "gpt-9", "reason": "x", "parts": [{"prompt": "só uma"}]}', allowed, "opus")
    assert d == {"effort": 5, "model": "opus", "reason": "x", "parts": []}  # modelo inválido volta ao pedido; 1 parte não é divisão
    parts = [{"title": f"p{i}", "prompt": f"faça {i}", "effort": i, "model": "haiku"} for i in range(1, 7)]
    d = orchestrator.parse(json.dumps({"effort": 4, "model": "sonnet", "parts": parts}), allowed, "opus")
    assert len(d["parts"]) == 4 and d["parts"][0] == {"title": "p1", "prompt": "faça 1", "effort": 1, "model": "haiku"}
    assert orchestrator.parse(json.dumps({"effort": 2, "model": "haiku", "parts": parts}), allowed, "opus", allow_split=False)["parts"] == []
    with pytest.raises(ValueError):
        orchestrator.parse("não sei", allowed, "opus")


def test_downgrades_model(orch, monkeypatch):
    monkeypatch.setenv("FAKE_TRIAGE", json.dumps({"effort": 1, "model": "haiku", "reason": "pergunta simples", "parts": []}))
    job = cli_bridge.new_session(orch["cwd"], "Dúvida", "o que é um JOIN?", model="opus", orchestrate=True)
    assert job["kind"] == "triage" and job["running"]
    done = finish(job)
    assert "haiku no lugar de opus" in done["output"] and len(done["sessions"]) == 1 and not done["error"]
    assert [model_of(c) for c in launches(orch["log"])] == ["haiku"]
    routed = cli_bridge.load_names()[done["sessions"][0]]["routed"]
    assert routed["effort"] == 1 and routed["requested"] == "opus" and routed["part"] is None
    snap = server.Office(projects=str(orch["log"].parent / "vazio")).state(24, 24)
    assert snap["manager"]["decisions"][0]["effort"] == 1 and snap["feed"][0]["tool"] == "GERENTE"


def test_splits_into_subagents(orch, monkeypatch):
    parts = [{"title": "API", "prompt": "documente a API", "effort": 2, "model": "haiku"},
             {"title": "Bug", "prompt": "depure o deadlock", "effort": 5, "model": "opus"},
             {"title": "Testes", "prompt": "escreva os testes", "effort": 3, "model": "sonnet"}]
    monkeypatch.setenv("FAKE_TRIAGE", json.dumps({"effort": 4, "model": "sonnet", "reason": "partes independentes", "parts": parts}))
    done = finish(cli_bridge.new_session(orch["cwd"], "Release", "prepare a release", model="sonnet", look_seed="p-x", orchestrate=True))
    calls = launches(orch["log"])
    assert sorted(model_of(c) for c in calls) == ["haiku", "opus", "sonnet"] and len(done["sessions"]) == 3
    for p in parts:
        call = next(c for c in calls if p["prompt"] in c["prompt"])
        assert f'cuida só do tema \\"{p["title"]}\\"'.replace("\\", "") in call["prompt"] and "trabalhando em paralelo" in call["prompt"]
    names = cli_bridge.load_names()
    assert sorted(names[s]["title"] for s in done["sessions"]) == ["Release · API", "Release · Bug", "Release · Testes"]
    assert sorted(names[s]["routed"]["part"] for s in done["sessions"]) == [[1, 3], [2, 3], [3, 3]]
    assert "dividida em 3 subagentes" in done["output"]


def test_triage_failure_falls_back(orch, monkeypatch):
    monkeypatch.setenv("FAKE_TRIAGE", "desculpe, não entendi")
    done = finish(cli_bridge.new_session(orch["cwd"], "X", "faça algo", model="sonnet", orchestrate=True))
    assert "não consegui avaliar" in done["output"] and [model_of(c) for c in launches(orch["log"])] == ["sonnet"]


def test_off_by_flag_or_config(orch):
    job = cli_bridge.new_session(orch["cwd"], "Direto", "faça", model="opus")
    assert job["kind"] == "new"
    finish(job)
    cfg = json.loads(cli_bridge.config_path().read_text("utf-8"))
    cli_bridge.config_path().write_text(json.dumps({**cfg, "orchestrator": {"enabled": False}}), encoding="utf-8")
    assert cli_bridge.new_session(orch["cwd"], "Direto", "faça", model="opus", orchestrate=True)["kind"] == "new"
