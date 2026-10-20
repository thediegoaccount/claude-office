"""Fila de pedidos de permissão gravados pelo hook PermissionRequest em arquivos temporários."""
import json
import os
import re
import secrets
import tempfile
import time
from pathlib import Path

import office

TOKEN = secrets.token_hex(16)
ID_RE = re.compile(r"^[0-9a-f]{32}$")


def tmp_dir():
    return Path(os.environ.get("CLAUDE_OFFICE_TMP") or Path(tempfile.gettempdir()) / "claude-office")


def pending_dir():
    return tmp_dir() / "pending"


def heartbeat():
    d = tmp_dir()
    d.mkdir(parents=True, exist_ok=True)
    (d / "server.alive").write_text(str(time.time()), encoding="utf-8")


def list_pending(now=None):
    now = now or time.time()
    out = []
    d = pending_dir()
    if not d.is_dir():
        return out
    for f in d.glob("*.json"):
        if not ID_RE.match(f.stem) or f.with_suffix(".decision").exists():
            continue
        try:
            r = json.loads(f.read_text("utf-8"))
        except (OSError, ValueError):
            continue
        exp = float(r.get("expires") or 0)
        if exp <= now:
            continue
        tool, inp = r.get("tool_name", ""), r.get("tool_input") or {}
        out.append({"id": f.stem, "session": r.get("session_id"), "tool": tool,
                    "text": office.summarize_tool(tool, inp) or tool,
                    "detail": office.tool_detail(tool, inp)[:400], "expires_in": round(exp - now, 1)})
    return sorted(out, key=lambda p: p["expires_in"])


def decide(pid, decision):
    if not ID_RE.match(str(pid or "")):
        raise ValueError("id inválido")
    if decision not in ("approve", "skip"):
        raise ValueError("decisão inválida")
    req = pending_dir() / f"{pid}.json"
    if not req.is_file():
        raise LookupError("pedido não encontrado")
    req.with_suffix(".decision").write_text(decision, encoding="utf-8")
    return {"ok": True, "id": pid, "decision": decision}
