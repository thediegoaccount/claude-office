"""Hook PermissionRequest do Claude Code: espera a aprovação dada na página do Claude Office.

Sem resposta (ou "Decidir no app") ele sai sem imprimir nada e o fluxo normal continua. Nunca nega.
"""
import hashlib
import json
import os
import sys
import tempfile
import time
import uuid
from pathlib import Path

BASE = Path(os.environ.get("CLAUDE_OFFICE_TMP") or Path(tempfile.gettempdir()) / "claude-office")
PENDING = BASE / "pending"
LOG = BASE / "office_permission.log"
ALIVE_MAX_AGE = 15


def log(msg):
    try:
        BASE.mkdir(parents=True, exist_ok=True)
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except OSError:
        pass


def cleanup(now):
    for f in PENDING.glob("*"):
        try:
            if now - f.stat().st_mtime > 300:
                f.unlink()
        except OSError:
            pass


def main():
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8", errors="replace") or "{}")
    except ValueError:
        log("entrada inválida")
        return 0
    alive = BASE / "server.alive"
    try:
        if time.time() - alive.stat().st_mtime > ALIVE_MAX_AGE:
            raise OSError
    except OSError:
        log("escritório fechado; seguindo fluxo normal")
        return 0
    wait = float(os.environ.get("OFFICE_WAIT_SECONDS") or 40)
    now = time.time()
    PENDING.mkdir(parents=True, exist_ok=True)
    cleanup(now)
    pid = hashlib.sha256(f"{data.get('session_id')}:{data.get('tool_use_id') or uuid.uuid4()}".encode()).hexdigest()[:32]
    req, dec = PENDING / f"{pid}.json", PENDING / f"{pid}.decision"
    req.write_text(json.dumps({"id": pid, "session_id": data.get("session_id"), "tool_name": data.get("tool_name"),
                               "tool_input": data.get("tool_input"), "created": now, "expires": now + wait}), encoding="utf-8")
    log(f"{pid} pedido {data.get('tool_name')} sessão {data.get('session_id')}")
    decision = None
    try:
        while time.time() < now + wait:
            if dec.exists():
                decision = dec.read_text(encoding="utf-8").strip()
                break
            time.sleep(0.3)
    finally:
        for f in (req, dec):
            try:
                f.unlink()
            except OSError:
                pass
    log(f"{pid} decisão {decision or 'nenhuma'}")
    if decision == "approve":
        sys.stdout.write(json.dumps({"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "allow"}}}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
