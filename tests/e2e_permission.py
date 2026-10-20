"""Teste manual: com o servidor rodando, simula o hook -> API -> aprovar.

    python server.py            (em outro terminal)
    python tests/e2e_permission.py [porta]
"""
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
BASE = f"http://127.0.0.1:{PORT}"
HOOK = Path(__file__).resolve().parent.parent / "hooks" / "office_permission.py"


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=10) as r:
        return json.loads(r.read())


def main():
    get("/api/state")  # renova o sinal de "escritório aberto"
    token = get("/api/token")["token"]
    payload = json.dumps({"session_id": "e2e-teste", "tool_use_id": f"e2e-{time.time()}", "tool_name": "Bash",
                          "tool_input": {"command": "echo teste e2e"}})
    proc = subprocess.Popen([sys.executable, str(HOOK)], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    proc.stdin.write(payload.encode())
    proc.stdin.close()
    pid = None
    for _ in range(50):
        pend = [p for p in get("/api/state")["pending"] if p["session"] == "e2e-teste"]
        if pend:
            pid = pend[0]["id"]
            break
        time.sleep(0.2)
    if not pid:
        print("FALHA: o pedido não apareceu em /api/state")
        proc.kill()
        return 1
    req = urllib.request.Request(BASE + "/api/decide", data=json.dumps({"id": pid, "decision": "approve"}).encode(),
                                 headers={"Content-Type": "application/json", "X-Office-Token": token}, method="POST")
    urllib.request.urlopen(req, timeout=10).read()
    out = proc.stdout.read().decode()
    proc.wait(60)
    ok = json.loads(out or "{}").get("hookSpecificOutput", {}).get("decision", {}).get("behavior") == "allow"
    print("OK: o hook devolveu allow" if ok else f"FALHA: saída do hook = {out!r}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
