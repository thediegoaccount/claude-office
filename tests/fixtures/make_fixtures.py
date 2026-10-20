"""Gera as transcrições sintéticas usadas nos testes (python tests/fixtures/make_fixtures.py)."""
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).parent / "projects"
T0 = datetime(2026, 1, 15, 12, 0, 0, tzinfo=UTC)
A = "11111111-1111-1111-1111-111111111111"
B = "22222222-2222-2222-2222-222222222222"
C = "33333333-3333-3333-3333-333333333333"
D = "44444444-4444-4444-4444-444444444444"
E = "55555555-5555-5555-5555-555555555555"


def ts(sec):
    return (T0 + timedelta(seconds=sec)).isoformat().replace("+00:00", "Z")


def u(n):
    return f"00000000-0000-0000-0000-{n:012d}"


def user(n, sec, content, cwd, sid, **kw):
    return {"type": "user", "uuid": u(n), "timestamp": ts(sec), "cwd": cwd, "sessionId": sid,
            "isSidechain": False, "permissionMode": "default", "message": {"role": "user", "content": content}, **kw}


def asst(n, sec, mid, blocks, cwd, sid, model="claude-opus-5-5", usage=None, **kw):
    return {"type": "assistant", "uuid": u(n), "timestamp": ts(sec), "cwd": cwd, "sessionId": sid, "isSidechain": False,
            "message": {"id": mid, "role": "assistant", "model": model, "content": blocks,
                        "usage": usage or {"input_tokens": 10, "output_tokens": 20, "cache_creation_input_tokens": 100, "cache_read_input_tokens": 1000}},
            **kw}


def write(path, rows, broken=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(r, ensure_ascii=False) for r in rows]
    if broken:
        lines.insert(2, '{"type": "assistant", "message": {quebrado')
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    cwd_a = "C:\\work\\alpha"
    long_text = "Resumo final: " + "detalhe importante " * 20
    rows_a = [
        {"type": "custom-title", "customTitle": "Titulo antigo", "sessionId": A},
        user(1, 0, "Refatore o módulo de pagamentos", cwd_a, A),
        asst(2, 5, "msg_a1", [{"type": "thinking", "thinking": "pensando"}], cwd_a, A),
        asst(3, 6, "msg_a1", [{"type": "text", "text": long_text}], cwd_a, A),
        asst(4, 7, "msg_a1", [{"type": "tool_use", "id": "tu1", "name": "Bash",
                                "input": {"command": "curl -H 'Authorization: Bearer abc.def' https://x --token=s3cr3t && " + "echo ok " * 20}}], cwd_a, A),
        user(5, 8, [{"type": "tool_result", "tool_use_id": "tu1", "content": "ok"}], cwd_a, A),
        {"type": "ai-title", "aiTitle": "Titulo IA", "sessionId": A},
        asst(6, 10, "msg_a2", [{"type": "tool_use", "id": "tu2", "name": "Task",
                                 "input": {"description": "Analisar cobertura", "subagent_type": "general-purpose",
                                           "prompt": "Analise a cobertura de testes do projeto"}}], cwd_a, A),
        {"type": "custom-title", "customTitle": "Refatorar pagamentos", "sessionId": A},
    ]
    write(ROOT / "C--work-alpha" / f"{A}.jsonl", rows_a, broken=True)
    sub = [
        user(101, 11, "Analise a cobertura de testes do projeto", cwd_a, A, isSidechain=True),
        asst(102, 20, "msg_s1", [{"type": "tool_use", "id": "st1", "name": "Read", "input": {"file_path": "C:\\work\\alpha\\src\\pay.py"}}],
             cwd_a, A, model="claude-sonnet-5-5", isSidechain=True),
    ]
    write(ROOT / "C--work-alpha" / A / "subagents" / "agent-a1.jsonl", sub)
    write(ROOT / "C--work-alpha" / A / "subagents" / "agent-aprompt_suggestion-x.jsonl", sub)

    cwd_b = "C:\\work\\beta"
    rows_b = [
        user(201, -600, "Documente a API", cwd_b, B),
        asst(202, -590, "msg_b1", [{"type": "tool_use", "id": "bt1", "name": "Task",
                                     "input": {"description": "Ler rotas", "subagent_type": "Explore", "prompt": "Liste as rotas"}}], cwd_b, B,
             model="claude-sonnet-5-5"),
        user(203, -50, "Liste as rotas", cwd_b, B, isSidechain=True, agentId="s1"),
        asst(204, -45, "msg_side", [{"type": "text", "text": "Rotas listadas."}], cwd_b, B, isSidechain=True, agentId="s1"),
        user(205, -30, [{"type": "tool_result", "tool_use_id": "bt1", "content": "ok"}], cwd_b, B),
        asst(206, -20, "msg_b2", [{"type": "text", "text": "Pronto, documentei."}], cwd_b, B, model="claude-sonnet-5-5"),
        {"type": "ai-title", "aiTitle": "Documentar API", "sessionId": B},
    ]
    write(ROOT / "C--work-beta" / f"{B}.jsonl", rows_b)
    write(ROOT / "C--work-beta" / f"{C}.jsonl", [user(301, 0, "<command-name>/help</command-name>", cwd_b, C)])
    write(ROOT / "C--work-beta" / f"{D}.jsonl", [
        user(401, 0, "This session is being continued from a previous conversation that ran out of context.", cwd_b, D),
        asst(402, 2, "msg_d", [{"type": "text", "text": "ok"}], cwd_b, D)])
    write(ROOT / "C--work-beta" / f"{E}.jsonl", [
        user(501, -100, [{"type": "text", "text": "Investigue o job noturno que falha"}], cwd_b, E),
        asst(502, -90, "msg_e", [{"type": "tool_use", "id": "et1", "name": "Grep", "input": {"pattern": "cron"}}], cwd_b, E, model="claude-haiku-5-5"),
        user(503, -80, [{"type": "tool_result", "tool_use_id": "et1", "content": "x"}], cwd_b, E),
    ])


if __name__ == "__main__":
    main()
