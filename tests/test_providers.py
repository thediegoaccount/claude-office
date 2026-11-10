import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

import cli_bridge
import office
import providers
import server

MODEL = "gemini/gemini-test"


@pytest.fixture
def fake(tmp_path):
    """Provedor falso compatível com OpenAI; guarda os pedidos recebidos."""
    seen = []

    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            seen.append({"path": self.path, "auth": self.headers.get("Authorization"), "body": body})
            last = body["messages"][-1]["content"]
            if last == "estoure":
                out, code = {"error": {"message": "quota exceeded"}}, 429
            else:
                out, code = {"choices": [{"message": {"role": "assistant", "content": f"eco: {last if isinstance(last, str) else 'imagem'}"}}]}, 200
            data = json.dumps(out).encode()
            self.send_response(code)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    for d in (cli_bridge._cache, cli_bridge._jobs, cli_bridge._busy):
        d.clear()
    office._CACHE.clear()
    cli_bridge.config_path().write_text(json.dumps({"workspace_roots": [str(tmp_path)], "providers": {
        "gemini": {"base_url": f"http://127.0.0.1:{srv.server_port}/v1", "api_key": "k-123", "models": ["gemini-test"]},
        "openai": {"models": ["gpt-x"]}}}), encoding="utf-8")
    yield seen
    srv.shutdown()


def wait(job_id, secs=10):
    end = time.time() + secs
    while time.time() < end:
        job = cli_bridge._jobs[job_id]
        if not job["running"]:
            return job
        time.sleep(0.02)
    raise AssertionError("job não terminou")


def test_groups_and_validation(fake, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    groups = {g["label"]: g for g in cli_bridge.models()["groups"]}
    assert groups["Google Gemini"]["models"] == [MODEL] and groups["Google Gemini"]["external"]
    assert groups["OpenAI · sem chave"]["ready"] is False
    assert cli_bridge._check_model(MODEL) == MODEL
    with pytest.raises(ValueError):
        cli_bridge._check_model("gemini/outro")


def test_new_chat_and_followup(fake, monkeypatch):
    monkeypatch.setenv("FAKE_AUTH", "none")  # não depende do login do Claude
    job = cli_bridge.new_session(None, "Dúvida rápida", "o que é Delta Lake?", model=MODEL, look_seed="p-abc")
    done = wait(job["id"])
    assert done["output"] == "eco: o que é Delta Lake?" and not done["error"] and done["external"]
    sid = job["session"]
    assert fake[0]["path"] == "/v1/chat/completions" and fake[0]["auth"] == "Bearer k-123"
    assert fake[0]["body"]["model"] == "gemini-test"

    done = wait(cli_bridge.send(sid, "e o time travel?")["id"])
    assert [m["role"] for m in fake[1]["body"]["messages"]] == ["user", "assistant", "user"]
    assert done["output"] == "eco: e o time travel?"

    snap = server.Office().state(24, 24)
    a = next(x for x in snap["agents"] if x["id"] == sid)
    assert a["external"] and a["model"] == MODEL and a["status"] == "waiting" and a["title"] == "Dúvida rápida"
    assert a["look_seed"] == "p-abc"
    assert sid not in {e[1] for e in office.usage_entries(0)[0]}


def test_provider_error_is_reported(fake):
    done = wait(cli_bridge.new_session(None, "", "estoure", model=MODEL)["id"])
    assert "429" in done["error"] and "quota exceeded" in done["error"]
    sid = done["session"]
    assert providers.history(sid) == [{"role": "user", "content": "estoure"}]
    done = wait(cli_bridge.send(sid, "de novo")["id"])
    assert done["output"].startswith("eco:")


def test_missing_key_and_mixing(fake, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    done = wait(cli_bridge.new_session(None, "", "oi", model="openai/gpt-x")["id"])
    assert "chave de API" in done["error"]
    sid = wait(cli_bridge.new_session(None, "", "oi", model=MODEL)["id"])["session"]
    with pytest.raises(ValueError):
        cli_bridge.send(sid, "oi", model="sonnet")
    with pytest.raises(ValueError):
        cli_bridge.send("77777777-7777-7777-7777-777777777777", "oi", model=MODEL)
