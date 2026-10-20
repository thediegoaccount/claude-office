"""Servidor local do Claude Office (só biblioteca padrão; escuta apenas em 127.0.0.1)."""
import argparse
import json
import mimetypes
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import cli_bridge
import demo
import office
import permissions
import usage

STATIC = Path(__file__).resolve().parent / "static"
MAX_BODY = 40 * 1024 * 1024
LOCAL_HOSTS = ("127.0.0.1", "localhost")
DEMO_MSG = "indisponível no modo demo"
_usage_cache = {}


class Office:
    def __init__(self, demo_mode=False, projects=None):
        self.demo = demo_mode
        self.projects = office.projects_dir(projects)

    def usage(self):
        hit = _usage_cache.get("u")
        if hit and time.time() - hit[0] < 10:
            return hit[1]
        cfg = cli_bridge.config()
        cyc, mc = usage.report(cfg, self.projects)
        cyc.update(cycle_start_day=int(cfg.get("cycle_start_day", 1)))
        _usage_cache["u"] = (time.time(), (cyc, mc))
        return cyc, mc

    def state(self, hours, limit):
        if self.demo:
            snap = demo.snapshot(hours, limit)
            snap.update(pending=demo.pending(), usage=demo.usage(), model_costs=demo.model_costs(), limits=demo.limits())
            busy = {}
        else:
            snap = office.snapshot(hours, limit, self.projects)
            permissions.heartbeat()
            cyc, mc = self.usage()
            snap.update(pending=permissions.list_pending(), usage=cyc, model_costs=mc, limits=cli_bridge.limits_snapshot())
            busy = cli_bridge.busy()
        names = cli_bridge.load_names()
        for a in snap["agents"]:
            n = names.get(a["id"]) or {}
            if n.get("title"):
                a["title"] = office.clip(n["title"], 60)
            a["look_seed"] = n.get("look_seed")
            a["origin"] = n.get("origin")
            a["busy"] = a["id"] in busy
        snap["demo"] = self.demo
        return snap

    def health(self):
        return {"projects": str(self.projects), "exists": self.projects.is_dir(), "demo": self.demo,
                "candidates": [{"path": str(p), "exists": p.is_dir()} for p in office.candidates()],
                "claude": {"path": cli_bridge.find_claude(), "searched": [{"path": c, "exists": Path(c).is_file()} for c in cli_bridge.claude_candidates()]}}


def _int(q, key, default, lo, hi):
    try:
        return max(lo, min(hi, int(q.get(key, [default])[0])))
    except ValueError:
        return default


class Handler(BaseHTTPRequestHandler):
    app: Office = None
    server_version = "ClaudeOffice/1.0"

    def log_message(self, *args):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def _err(self, code, msg):
        self._send(code, {"error": msg})

    def _same_origin(self):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]")
        if host not in LOCAL_HOSTS:
            return False
        origin = self.headers.get("Origin")
        if origin:
            o = urlparse(origin)
            return o.scheme == "http" and o.hostname in LOCAL_HOSTS
        return True

    def _deny(self, why):
        sys.stderr.write(f"[office] 403 {self.command} {self.path}: {why}\n")
        self._err(403, "acesso negado")

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            if u.path == "/api/state":
                return self._send(200, self.app.state(_int(q, "hours", 24, 1, 168), _int(q, "limit", 24, 1, 24)))
            if u.path == "/api/full":
                if self.app.demo:
                    return self._send(200, {"text": "Texto completo (modo demo)."})
                return self._send(200, {"text": office.full_text(q.get("session", [""])[0], q.get("ref", [""])[0], self.app.projects)})
            if u.path == "/api/health":
                return self._send(200, self.app.health())
            if u.path in ("/api/cli/status", "/api/cli/models", "/api/token"):
                if not self._same_origin():
                    return self._deny("origem")
                if u.path == "/api/token":
                    return self._send(200, {"token": permissions.TOKEN})
                if self.app.demo:
                    return self._send(200, {"available": False, "demo": True, "logged_in": False, "auth_state": "demo",
                                            "auth_message": DEMO_MSG, "workspaces": [], "roots": [], "jobs": [],
                                            "default": "padrão do CLI", "groups": []})
                if u.path == "/api/cli/models":
                    return self._send(200, cli_bridge.models())
                return self._send(200, cli_bridge.status(recheck=q.get("recheck", ["0"])[0] == "1"))
            return self._static(u.path)
        except ValueError as e:
            return self._err(400, str(e))
        except LookupError as e:
            return self._err(404, str(e))
        except OSError as e:
            return self._err(500, str(e))

    def _static(self, path):
        rel = "index.html" if path in ("", "/") else path.lstrip("/")
        try:
            target = (STATIC / rel).resolve()
        except (OSError, ValueError):
            return self._err(404, "não encontrado")
        if STATIC.resolve() not in target.parents or not target.is_file():
            return self._err(404, "não encontrado")
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        return self._send(200, target.read_bytes(), ctype)

    def do_POST(self):
        u = urlparse(self.path)
        if not self._same_origin():
            return self._deny("origem")
        if self.headers.get("X-Office-Token") != permissions.TOKEN:
            return self._deny("token")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return self._err(400, "Content-Length inválido")
        if length > MAX_BODY:
            return self._err(413, "corpo grande demais (máx. 40 MB)")
        try:
            body = json.loads(self.rfile.read(length) or b"{}") if length else {}
            if not isinstance(body, dict):
                raise TypeError("corpo inválido")
            return self._send(200, self._post(u.path, body))
        except PermissionError as e:
            return self._err(403, str(e))
        except RuntimeError as e:
            return self._err(409, str(e))
        except LookupError as e:
            return self._err(404, str(e))
        except (ValueError, TypeError, OSError) as e:
            return self._err(400, str(e))

    def _post(self, path, b):
        if path == "/api/decide":
            if self.app.demo:
                return {"ok": True, "demo": True}
            return permissions.decide(b.get("id"), b.get("decision"))
        if path.startswith("/api/cli/") and self.app.demo:
            raise RuntimeError(DEMO_MSG)
        if path == "/api/cli/new":
            return cli_bridge.new_session(b.get("cwd"), b.get("title"), b.get("prompt"), bool(b.get("plan")),
                                          b.get("model") or None, b.get("look_seed"), b.get("images"))
        if path == "/api/cli/send":
            return cli_bridge.send(str(b.get("session") or ""), b.get("prompt"), bool(b.get("plan")), b.get("model") or None,
                                   b.get("images"))
        if path == "/api/cli/cancel":
            return cli_bridge.cancel(b.get("id"))
        if path == "/api/cli/auth":
            return cli_bridge.auth_action(b.get("action"))
        raise LookupError("rota não encontrada")


def make_server(port=8777, demo_mode=False, projects=None):
    handler = type("OfficeHandler", (Handler,), {"app": Office(demo_mode, projects)})
    srv = ThreadingHTTPServer(("127.0.0.1", port), handler)
    srv.daemon_threads = True
    return srv


def main(argv=None):
    ap = argparse.ArgumentParser(description="Claude Office")
    ap.add_argument("--demo", action="store_true", help="dados fictícios")
    ap.add_argument("--projects", help="pasta de projetos do Claude Code (padrão: ~/.claude/projects)")
    ap.add_argument("--port", type=int, default=8777)
    a = ap.parse_args(argv)
    srv = make_server(a.port, a.demo, a.projects or os.environ.get("CLAUDE_OFFICE_PROJECTS"))
    where = "modo demo (dados fictícios)" if a.demo else srv.RequestHandlerClass.app.projects
    print(f"Claude Office em http://127.0.0.1:{srv.server_address[1]}  (projetos: {where})", flush=True)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        while t.is_alive():
            t.join(1)
    except KeyboardInterrupt:
        srv.shutdown()


if __name__ == "__main__":
    main()
