import http.client
import json
import threading

import pytest

import permissions
import server


@pytest.fixture
def srv(projects):
    s = server.make_server(0, False, projects)
    t = threading.Thread(target=s.serve_forever, daemon=True)
    t.start()
    yield s.server_address[1]
    s.shutdown()


@pytest.fixture
def demo_srv():
    s = server.make_server(0, True)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    yield s.server_address[1]
    s.shutdown()


def req(port, method, path, body=None, headers=None, raw_len=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    data = json.dumps(body).encode() if body is not None else b""
    h = {"Host": f"127.0.0.1:{port}", **(headers or {})}
    c.putrequest(method, path, skip_host=True)
    for k, v in h.items():
        c.putheader(k, v)
    c.putheader("Content-Length", str(raw_len if raw_len is not None else len(data)))
    c.endheaders()
    if raw_len is None and data:
        c.send(data)
    r = c.getresponse()
    out = r.read()
    c.close()
    try:
        return r.status, json.loads(out)
    except ValueError:
        return r.status, out


def test_state_and_static(srv):
    code, st = req(srv, "GET", "/api/state?hours=999999&limit=24")
    assert code == 200 and "agents" in st and "usage" in st and "pending" in st and "model_costs" in st
    code, body = req(srv, "GET", "/")
    assert code == 200 and b"Claude Office" in body
    code, h = req(srv, "GET", "/api/health")
    assert code == 200 and h["exists"] and h["candidates"]


def test_path_traversal(srv):
    for p in ("/../server.py", "/..%2fserver.py", "/static/../../server.py", "/%2e%2e/server.py"):
        assert req(srv, "GET", p)[0] == 404


def test_token_and_origin(srv):
    tok = req(srv, "GET", "/api/token")[1]["token"]
    assert tok == permissions.TOKEN
    assert req(srv, "GET", "/api/token", headers={"Origin": "http://evil.com"})[0] == 403
    assert req(srv, "GET", "/api/token", headers={"Host": "evil.com"})[0] == 403
    body = {"id": "0" * 32, "decision": "approve"}
    assert req(srv, "POST", "/api/decide", body)[0] == 403
    assert req(srv, "POST", "/api/decide", body, {"X-Office-Token": "x"})[0] == 403
    assert req(srv, "POST", "/api/decide", body, {"X-Office-Token": tok, "Origin": "http://evil.com"})[0] == 403
    assert req(srv, "POST", "/api/decide", body, {"X-Office-Token": tok})[0] == 404
    assert req(srv, "POST", "/api/decide", {"id": "../x", "decision": "approve"}, {"X-Office-Token": tok})[0] == 400


def test_body_limit(srv):
    code, _ = req(srv, "POST", "/api/cli/send", headers={"X-Office-Token": permissions.TOKEN}, raw_len=41 * 1024 * 1024)
    assert code == 413


def test_full_errors(srv):
    assert req(srv, "GET", "/api/full?session=x&ref=bad")[0] == 400
    assert req(srv, "GET", "/api/full?session=99999999-9999-9999-9999-999999999999&ref=99999999-0000-0000-0000-000000000000:say")[0] == 404


def test_demo(demo_srv):
    code, st = req(demo_srv, "GET", "/api/state")
    assert code == 200 and st["demo"] and len(st["agents"]) == 10 and st["pending"]
    assert st["source"]["db"] == "modo demo (dados fictícios)"
    code, r = req(demo_srv, "POST", "/api/cli/new", {"cwd": "x"}, {"X-Office-Token": permissions.TOKEN})
    assert code == 409 and "demo" in r["error"]


def test_second_instance_on_same_port(srv, capsys):
    server.main(["--demo", "--port", str(srv)])
    assert "já está em uso" in capsys.readouterr().out


def test_favicon(srv):
    code, body = req(srv, "GET", "/icon.png")
    assert code == 200 and body[:8] == b"\x89PNG\r\n\x1a\n"
