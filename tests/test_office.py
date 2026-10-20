import pytest
from conftest import NOW

import office

A = "11111111-1111-1111-1111-111111111111"
B = "22222222-2222-2222-2222-222222222222"


def test_mask_and_clip():
    s = office.mask("Authorization: Bearer abc.def token=xyz password: 'p w' sk-ant-abcdefghijklmnop ghp_" + "a" * 24)
    assert "abc.def" not in s and "xyz" not in s and "p w" not in s and "sk-ant" not in s and "ghp_" not in s
    assert office.clip("a   b\n c", 90) == "a b c"
    assert office.clip("x" * 100, 10) == "x" * 9 + "…"


def test_summarize_tool():
    assert office.summarize_tool("Read", {"file_path": "C:\\a\\b.py"}) == "b.py"
    assert office.summarize_tool("mcp__srv__tool", {}) == "srv/tool"
    assert office.summarize_tool("TodoWrite", {"todos": [{"status": "pending", "content": "a"}]}) == "1 tarefas"
    assert office.summarize_tool("TodoWrite", {"todos": [{"status": "in_progress", "content": "fazer x"}]}) == "fazer x"
    assert "[pending] a" in office.tool_detail("TodoWrite", {"todos": [{"status": "pending", "content": "a"}]})


def test_derive_statuses():
    tool = {"t": "assistant", "uuid": "u1", "ts": NOW - 5, "blocks": [{"type": "tool_use", "name": "Bash", "input": {"command": "ls"}}]}
    say = {"t": "assistant", "uuid": "u2", "ts": NOW - 5, "blocks": [{"type": "text", "text": "pronto"}]}
    res = {"t": "user", "uuid": "u3", "ts": NOW - 4, "blocks": [{"type": "tool_result"}]}
    st, cur, ev = office.derive([tool], NOW - 5, NOW)
    assert st == "working" and cur["tool"] == "Bash" and cur["text"] == "ls"
    assert office.derive([res, tool], NOW - 4, NOW)[0] == "thinking"
    st, cur, ev = office.derive([say, tool], NOW - 5, NOW)
    assert st == "waiting" and cur is None and [e["tool"] for e in ev] == ["say", "Bash"]
    assert office.derive([tool], NOW - 16 * 60, NOW)[0] == "away"


def test_snapshot(projects):
    snap = office.snapshot(window_hours=24, root=projects, now=NOW)
    by = {a["id"]: a for a in snap["agents"]}
    assert set(by) == {A, B, f"{A}::a1", f"{B}::s1", "55555555-5555-5555-5555-555555555555"}
    a = by[A]
    assert a["title"] == "Refatorar pagamentos" and a["status"] == "working" and a["workspace"] == "alpha"
    assert a["current"]["tool"] == "Task" and a["current"]["text"] == "Analisar cobertura"
    assert by[B]["title"] == "Documentar API" and by[B]["status"] == "waiting"
    assert by["55555555-5555-5555-5555-555555555555"]["title"].startswith("Investigue o job") and \
        by["55555555-5555-5555-5555-555555555555"]["status"] == "thinking"
    sub = by[f"{A}::a1"]
    assert sub["kind"] == "subagent" and sub["parent"] == A and sub["status"] == "working"
    assert sub["title"] == "Analisar cobertura (general-purpose)" and sub["model"] == "claude-sonnet-5-5"
    side = by[f"{B}::s1"]
    assert side["status"] == "done" and side["title"].startswith("Ler rotas")
    assert snap["source"]["total_sessions"] == 5 and len(snap["feed"]) > 0
    assert all(snap["feed"][i]["ts"] >= snap["feed"][i + 1]["ts"] for i in range(len(snap["feed"]) - 1))


def test_subagent_done_disappears(projects):
    snap = office.snapshot(root=projects, now=NOW + 400)
    assert f"{B}::s1" not in {a["id"] for a in snap["agents"]}


def test_refs_and_full_text(projects):
    snap = office.snapshot(root=projects, now=NOW)
    a = next(x for x in snap["agents"] if x["id"] == A)
    refs = {e["tool"]: e["ref"] for e in a["events"] if "ref" in e}
    assert refs["say"].endswith(":say") and refs["Bash"].endswith(":0")
    bash = office.full_text(A, refs["Bash"], projects)
    assert "echo ok" in bash and "abc.def" not in bash and "s3cr3t" not in bash
    assert "detalhe importante" in office.full_text(A, refs["say"], projects)
    with pytest.raises(ValueError):
        office.full_text(A, "../etc:say", projects)
    with pytest.raises(ValueError):
        office.full_text("../x", refs["say"], projects)
    with pytest.raises(LookupError):
        office.full_text(A, "99999999-0000-0000-0000-000000000000:say", projects)
    with pytest.raises(LookupError):
        office.full_text("99999999-9999-9999-9999-999999999999", refs["say"], projects)


def test_dedupe_usage_and_broken_line(projects):
    entries, titles = office.usage_entries(NOW - 86400, projects)
    mine = [e for e in entries if e[1] == A]
    assert len(mine) == 3  # msg_a1 (3 linhas) + msg_a2 + subagente msg_s1
    assert titles[A][0] == "Refatorar pagamentos"


def test_title_priority(projects):
    p = office.load(projects / "C--work-alpha" / f"{A}.jsonl")
    assert office.session_title(p) == "Refatorar pagamentos"
    p.custom_title = None
    assert office.session_title(p) == "Titulo IA"
    p.ai_title = None
    assert office.session_title(p) == "Refatore o módulo de pagamentos"


def test_incremental_and_partial_line(projects):
    f = projects / "C--work-beta" / f"{B}.jsonl"
    office.load(f)
    with open(f, "a", encoding="utf-8") as fh:
        fh.write('{"type": "custom-title", "customTitle": "Novo", "sessionId": "x"}\n{"type": "custom-tit')
    assert office.load(f).custom_title == "Novo"
    with open(f, "a", encoding="utf-8") as fh:
        fh.write('le", "customTitle": "Depois"}\n')
    assert office.load(f).custom_title == "Depois"
