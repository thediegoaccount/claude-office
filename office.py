"""Leitura somente-leitura das transcrições do Claude Code (~/.claude/projects)."""
import json
import os
import re
import time
from collections import deque
from datetime import datetime
from pathlib import Path

TAIL_RECORDS = 300
AWAY_AFTER = 15 * 60
SUB_DONE_TTL = 120
DETAIL_LIMIT = 20000
UUID_RE = re.compile(r"^[0-9a-fA-F-]{8,64}$")
REF_RE = re.compile(r"^([0-9a-fA-F-]{8,64}):(say|\d{1,4})$")
AGENT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
SUMMARY_PREFIXES = ("This session is being continued from a previous conversation",)
NOISE_PREFIXES = ("<command-", "<local-command", "Caveat:", "[Request interrupted")

_MASKS = [
    (re.compile(r"(?i)bearer\s+[a-z0-9._\-]+"), "Bearer ***"),
    (re.compile(r"(?i)\b(token|password|passwd|pwd|secret|api[_-]?key|pat)\b(\s*[:=]\s*|\s+)(\"[^\"]*\"|'[^']*'|\S+)"), r"\1\2***"),
    (re.compile(r"\b(sk-ant-[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]+)\b"), "***"),
]


def mask(text):
    text = "" if text is None else str(text)
    for rx, rep in _MASKS:
        text = rx.sub(rep, text)
    return text


def clip(text, size=90):
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text if len(text) <= size else text[: size - 1].rstrip() + "…"


def claude_dir():
    return Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")


def candidates():
    out = []
    env = os.environ.get("CLAUDE_OFFICE_PROJECTS")
    if env:
        out.append(Path(env))
    out.append(claude_dir() / "projects")
    out.append(Path.home() / ".claude" / "projects")
    seen, res = set(), []
    for p in out:
        if str(p) not in seen:
            seen.add(str(p))
            res.append(p)
    return res


def projects_dir(override=None):
    if override:
        return Path(override)
    for p in candidates():
        if p.is_dir():
            return p
    return candidates()[0]


def parse_ts(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)).timestamp()
    except ValueError:
        return None


def _base(path):
    return Path(str(path)).name if path else ""


def summarize_tool(name, inp):
    inp = inp if isinstance(inp, dict) else {}
    name = name or ""
    if name == "Bash":
        s = inp.get("command", "")
    elif name in ("Read", "Edit", "Write", "MultiEdit", "NotebookEdit"):
        s = _base(inp.get("file_path") or inp.get("notebook_path"))
    elif name == "Grep" or name == "Glob":
        s = inp.get("pattern", "")
    elif name == "WebSearch":
        s = inp.get("query", "")
    elif name == "WebFetch":
        s = inp.get("url", "")
    elif name in ("Task", "Agent"):
        s = inp.get("description", "")
    elif name == "TodoWrite":
        todos = inp.get("todos") or []
        cur = [t for t in todos if isinstance(t, dict) and t.get("status") == "in_progress"]
        s = (cur[0].get("activeForm") or cur[0].get("content", "")) if cur else f"{len(todos)} tarefas"
    elif name == "Skill":
        s = inp.get("skill") or inp.get("name", "")
    elif name.startswith("mcp__"):
        parts = name.split("__")
        s = "/".join(parts[1:3]) if len(parts) >= 3 else name
    elif name in ("BashOutput", "KillShell", "KillBash"):
        s = inp.get("bash_id") or inp.get("shell_id", "")
    else:
        s = ""
    return clip(mask(s), 90)


def tool_detail(name, inp):
    inp = inp if isinstance(inp, dict) else {}
    name = name or ""
    if name == "Bash":
        s = inp.get("command", "")
    elif name in ("Read", "Edit", "Write", "MultiEdit", "NotebookEdit"):
        s = inp.get("file_path") or inp.get("notebook_path") or ""
    elif name in ("Grep", "Glob"):
        s = inp.get("pattern", "") + (f"  (em {inp['path']})" if inp.get("path") else "")
    elif name == "WebSearch":
        s = inp.get("query", "")
    elif name == "WebFetch":
        s = inp.get("url", "")
    elif name in ("Task", "Agent"):
        s = (inp.get("description", "") + "\n\n" + inp.get("prompt", "")).strip()
    elif name == "TodoWrite":
        s = "\n".join(f"[{t.get('status', '?')}] {t.get('content', '')}" for t in inp.get("todos") or [] if isinstance(t, dict))
    elif name == "Skill":
        s = inp.get("skill") or inp.get("name", "")
    elif name.startswith("mcp__"):
        s = json.dumps(inp, ensure_ascii=False, indent=1)
    else:
        s = json.dumps(inp, ensure_ascii=False) if inp else ""
    return mask(str(s))[:DETAIL_LIMIT]


# ---------- leitura incremental ----------

def _trim(v, n=DETAIL_LIMIT):
    if isinstance(v, str):
        return v[:n]
    if isinstance(v, dict):
        return {k: _trim(x, n) for k, x in v.items()}
    if isinstance(v, list):
        return [_trim(x, n) for x in v[:200]]
    return v


def _blocks(content):
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    out = []
    for b in content if isinstance(content, list) else []:
        if not isinstance(b, dict):
            continue
        t = b.get("type")
        if t == "text":
            out.append({"type": "text", "text": str(b.get("text", ""))[:DETAIL_LIMIT]})
        elif t == "tool_use":
            out.append({"type": "tool_use", "id": b.get("id"), "name": b.get("name", ""), "input": _trim(b.get("input") or {})})
        elif t in ("tool_result", "image", "thinking", "redacted_thinking"):
            out.append({"type": t, "tool_use_id": b.get("tool_use_id")} if t == "tool_result" else {"type": t})
    return out


def _user_text(blocks):
    return "\n".join(b["text"] for b in blocks if b["type"] == "text").strip()


def is_real_user(rec):
    if rec["t"] != "user" or rec.get("meta"):
        return False
    text = _user_text(rec["blocks"])
    if any(b["type"] == "image" for b in rec["blocks"]):
        return True
    return bool(text) and not text.startswith(NOISE_PREFIXES)


class _Parsed:
    def __init__(self):
        self.offset = 0
        self.size = -1
        self.mtime = 0
        self.recs = deque(maxlen=TAIL_RECORDS)
        self.side = {}
        self.first_ts = self.last_ts = None
        self.cwd = self.model = self.mode = self.effort = None
        self.custom_title = self.ai_title = self.summary = None
        self.first_user = None
        self.starts_summary = False
        self.usage = {}
        self.tasks = []
        self.agent_map = {}

    def feed(self, r):
        t = r.get("type")
        if t == "custom-title" and r.get("customTitle"):
            self.custom_title = str(r["customTitle"])
        elif t == "ai-title" and r.get("aiTitle"):
            self.ai_title = str(r["aiTitle"])
        elif t == "summary" and r.get("summary"):
            self.summary = str(r["summary"])
        if t not in ("user", "assistant"):
            return
        ts = parse_ts(r.get("timestamp"))
        if ts:
            self.first_ts = self.first_ts or ts
            self.last_ts = max(self.last_ts or ts, ts)
        if r.get("cwd"):
            self.cwd = r["cwd"]
        msg = r.get("message") if isinstance(r.get("message"), dict) else {}
        rec = {"t": t, "uuid": r.get("uuid"), "ts": ts, "blocks": _blocks(msg.get("content")),
               "meta": bool(r.get("isMeta") or r.get("isCompactSummary") or r.get("isVisibleInTranscriptOnly"))}
        if t == "assistant":
            rec["model"] = msg.get("model")
            if msg.get("model") and msg.get("model") != "<synthetic>":
                self.model = msg["model"]
            if r.get("effort"):
                self.effort = r["effort"]
            u = msg.get("usage")
            if isinstance(u, dict) and msg.get("id"):
                self.usage[msg["id"]] = (ts or 0, msg.get("model") or "", int(u.get("input_tokens") or 0),
                                         int(u.get("output_tokens") or 0), int(u.get("cache_creation_input_tokens") or 0),
                                         int(u.get("cache_read_input_tokens") or 0))
            for b in rec["blocks"]:
                if b["type"] == "tool_use" and b["name"] in ("Task", "Agent"):
                    inp = b["input"]
                    self.tasks.append({"id": b.get("id"), "description": inp.get("description", ""),
                                       "subagent_type": inp.get("subagent_type", ""), "prompt": str(inp.get("prompt", ""))[:200]})
        else:
            if r.get("permissionMode"):
                self.mode = r["permissionMode"]
            tur = r.get("toolUseResult")
            if isinstance(tur, dict) and tur.get("agentId"):
                for b in rec["blocks"]:
                    if b["type"] == "tool_result":
                        self.agent_map[str(tur["agentId"])] = b.get("tool_use_id")
            if self.first_user is None and not r.get("isSidechain") and is_real_user(rec):
                text = _user_text(rec["blocks"])
                self.first_user = text or "(imagem)"
                self.starts_summary = bool(r.get("isCompactSummary")) or text.startswith(SUMMARY_PREFIXES)
        if r.get("isSidechain") and r.get("agentId") is not None:
            self.side.setdefault(str(r["agentId"]), deque(maxlen=TAIL_RECORDS)).append(rec)
        else:
            self.recs.append(rec)


_CACHE = {}


def load(path):
    path = Path(path)
    st = path.stat()
    key = str(path)
    p = _CACHE.get(key)
    if p is None or st.st_size < p.offset:
        p = _Parsed()
    if (st.st_size, st.st_mtime) == (p.size, p.mtime):
        return p
    if st.st_size > p.offset:
        with open(path, "rb") as f:
            f.seek(p.offset)
            data = f.read(st.st_size - p.offset)
        end = data.rfind(b"\n")
        if end >= 0:
            p.offset += end + 1
            for line in data[: end + 1].splitlines():
                if not line.strip():
                    continue
                try:
                    r = json.loads(line.decode("utf-8", errors="replace"))
                except ValueError:
                    continue
                if isinstance(r, dict):
                    p.feed(r)
    p.size, p.mtime = st.st_size, st.st_mtime
    _CACHE[key] = p
    return p


# ---------- derivação de estado ----------

def _record_events(rec):
    evs = []
    for i, b in enumerate(rec["blocks"]):
        if b["type"] == "tool_use":
            s = summarize_tool(b["name"], b["input"])
            ev = {"ts": rec["ts"], "tool": b["name"], "text": s}
            if len(tool_detail(b["name"], b["input"])) > len(s) and rec.get("uuid"):
                ev["ref"] = f"{rec['uuid']}:{i}"
            evs.append(ev)
    text = mask(_user_text(rec["blocks"]) if rec["t"] == "assistant" else "")
    if text:
        short = clip(text, 140)
        ev = {"ts": rec["ts"], "tool": "say", "text": short}
        if len(re.sub(r"\s+", " ", text).strip()) > len(short) and rec.get("uuid"):
            ev["ref"] = f"{rec['uuid']}:say"
        evs.append(ev)
    return evs


def derive(messages, last_activity, now):
    """messages: do mais novo para o mais antigo. Retorna (status, current, events[:12])."""
    events = []
    for rec in messages:
        if rec["t"] == "assistant":
            events.extend(reversed(_record_events(rec)))
            if len(events) >= 12:
                break
    events = events[:12]
    status = "waiting"
    if last_activity is None or now - last_activity > AWAY_AFTER:
        status = "away"
    else:
        for rec in messages:
            if rec["t"] == "user":
                if rec.get("meta"):
                    continue
                if any(b["type"] == "tool_result" for b in rec["blocks"]):
                    status = "thinking"
                    break
                text = _user_text(rec["blocks"])
                if text.startswith(NOISE_PREFIXES):
                    status = "waiting"
                    break
                if text or any(b["type"] == "image" for b in rec["blocks"]):
                    status = "thinking"
                    break
                continue
            types = {b["type"] for b in rec["blocks"]}
            if "tool_use" in types:
                status = "working"
            elif types and types <= {"thinking", "redacted_thinking"}:
                status = "thinking"
            else:
                status = "waiting"
            break
    current = events[0] if status in ("working", "thinking") and events else None
    return status, current, events


def session_title(p, sid=None, folder=None):
    side = None
    if folder is not None and sid:
        f = folder / sid / "custom-title.json"
        if f.is_file():
            try:
                d = json.loads(f.read_text("utf-8"))
                side = d.get("customTitle") or d.get("title") if isinstance(d, dict) else None
            except (OSError, ValueError):
                side = None
    t = p.custom_title or side or p.ai_title or p.summary or p.first_user or sid or "sessão"
    return clip(mask(t), 60)


def _agent(p, sid, now, kind="session", recs=None):
    recs = list(recs if recs is not None else p.recs)
    msgs = recs[::-1]
    last = max((r["ts"] for r in recs if r["ts"]), default=None)
    status, current, events = derive(msgs, last, now)
    return {"id": sid, "kind": kind, "model": p.model, "mode": p.mode, "effort": p.effort,
            "cwd": p.cwd, "workspace": _base(p.cwd), "created_at": p.first_ts if kind == "session" else min((r["ts"] for r in recs if r["ts"]), default=None),
            "last_activity_at": last, "status": status, "current": current, "events": events}


def _sub_title(parent, agent_id, sub, meta):
    desc = None
    if isinstance(meta, dict):
        desc = meta.get("description") or meta.get("title")
    if not desc and parent is not None:
        tuid = parent.agent_map.get(agent_id) or (meta or {}).get("toolUseId") or (meta or {}).get("parentToolUseId")
        first = None
        for r in sub:
            if r["t"] == "user":
                first = _user_text(r["blocks"])[:200]
                break
        for t in reversed(parent.tasks):
            if (tuid and t["id"] == tuid) or (first and t["prompt"] and first.startswith(t["prompt"][:120])):
                desc = t["description"] + (f" ({t['subagent_type']})" if t["subagent_type"] else "")
                break
        if not desc and first:
            desc = first
    return clip(mask(desc or f"subagente {agent_id}"), 60)


def _subagents(folder, sid, parent, now):
    out = []
    sub_dir = folder / sid / "subagents"
    if sub_dir.is_dir():
        for f in sub_dir.glob("agent-*.jsonl"):
            if f.name.startswith("agent-aprompt_suggestion-"):
                continue
            try:
                if now - f.stat().st_mtime > AWAY_AFTER:
                    continue
                sp = load(f)
            except OSError:
                continue
            aid = f.stem[len("agent-"):]
            meta = None
            mf = f.with_name(f.stem + ".meta.json")
            if mf.is_file():
                try:
                    meta = json.loads(mf.read_text("utf-8"))
                except (OSError, ValueError):
                    meta = None
            out.append((aid, sp, list(sp.recs), meta))
    for aid, recs in parent.side.items():
        out.append((aid, parent, list(recs), None))
    agents = []
    for aid, sp, recs, meta in out:
        if not AGENT_ID_RE.match(aid) or not recs:
            continue
        a = _agent(sp, f"{sid}::{aid}", now, "subagent", recs)
        if a["last_activity_at"] is None or now - a["last_activity_at"] > AWAY_AFTER:
            continue
        if a["status"] == "waiting":
            a["status"] = "done"
            if now - a["last_activity_at"] > SUB_DONE_TTL:
                continue
        elif a["status"] == "away":
            a["status"] = "thinking"
        a["parent"] = sid
        a["title"] = _sub_title(parent, aid, recs, meta)
        a["model"] = a["model"] or parent.model
        agents.append(a)
    return agents


def iter_session_files(root, since=None):
    root = Path(root)
    if not root.is_dir():
        return
    for folder in root.iterdir():
        if not folder.is_dir():
            continue
        for f in folder.glob("*.jsonl"):
            try:
                if since is None or f.stat().st_mtime >= since:
                    yield folder, f
            except OSError:
                continue


def snapshot(window_hours=24, limit=24, root=None, now=None):
    now = now or time.time()
    root = projects_dir(root)
    sessions = []
    for folder, f in iter_session_files(root, now - window_hours * 3600):
        try:
            p = load(f)
        except OSError:
            continue
        if p.first_user is None or p.starts_summary:
            continue
        a = _agent(p, f.stem, now)
        a["title"] = session_title(p, f.stem, folder)
        sessions.append((a, folder, p))
    sessions.sort(key=lambda x: x[0]["last_activity_at"] or 0, reverse=True)
    sessions = sessions[:limit]
    agents, feed = [], []
    for a, folder, p in sessions:
        agents.append(a)
        feed.extend(dict(e, agent=a["id"], name=a["title"]) for e in a["events"][:6])
        for s in _subagents(folder, a["id"], p, now):
            agents.append(s)
            feed.extend(dict(e, agent=s["id"], name=s["title"]) for e in s["events"][:4])
    feed.sort(key=lambda e: e["ts"] or 0, reverse=True)
    total = sum(1 for _ in iter_session_files(root))
    latest = max((a["last_activity_at"] or 0 for a in agents), default=None) or None
    return {"now": now, "agents": agents, "feed": feed[:40],
            "source": {"projects": str(root), "exists": root.is_dir(), "total_sessions": total, "latest_activity_at": latest}}


def find_session_file(session_id, root=None):
    root = projects_dir(root)
    sid, _, aid = session_id.partition("::")
    if not UUID_RE.match(sid) or (aid and not AGENT_ID_RE.match(aid)):
        raise ValueError("id de sessão inválido")
    if root.is_dir():
        for folder in root.iterdir():
            main = folder / f"{sid}.jsonl"
            if aid:
                sub = folder / sid / "subagents" / f"agent-{aid}.jsonl"
                if sub.is_file():
                    return sub, None
                if main.is_file():
                    return main, aid
            elif main.is_file():
                return main, None
    raise LookupError("sessão não encontrada")


def full_text(session_id, ref, root=None):
    m = REF_RE.match(str(ref or ""))
    if not m:
        raise ValueError("referência inválida")
    uuid, part = m.groups()
    path, side_aid = find_session_file(str(session_id or ""), root)
    with open(path, "rb") as fh:
        for line in fh:
            if uuid.encode() not in line:
                continue
            try:
                r = json.loads(line.decode("utf-8", errors="replace"))
            except ValueError:
                continue
            if not isinstance(r, dict) or r.get("uuid") != uuid or r.get("type") != "assistant":
                continue
            if side_aid and str(r.get("agentId")) != side_aid:
                continue
            blocks = _blocks((r.get("message") or {}).get("content"))
            if part == "say":
                text = _user_text(blocks)
                if text:
                    return mask(text)[:DETAIL_LIMIT]
            else:
                i = int(part)
                if i < len(blocks) and blocks[i]["type"] == "tool_use":
                    return tool_detail(blocks[i]["name"], blocks[i]["input"])
    raise LookupError("registro não encontrado")


def usage_entries(since, root=None):
    """Lista de (ts, session_id, model, input, output, cache_creation, cache_read) deduplicada por message.id."""
    root = projects_dir(root)
    out, titles = [], {}
    for folder, f in iter_session_files(root, since):
        try:
            p = load(f)
        except OSError:
            continue
        titles[f.stem] = (session_title(p, f.stem, folder), p.model, p.effort)
        files = [p]
        sub_dir = folder / f.stem / "subagents"
        if sub_dir.is_dir():
            for sf in sub_dir.glob("agent-*.jsonl"):
                if sf.name.startswith("agent-aprompt_suggestion-"):
                    continue
                try:
                    if sf.stat().st_mtime >= since:
                        files.append(load(sf))
                except OSError:
                    continue
        seen = set()
        for fp in files:
            for mid, u in fp.usage.items():
                if mid in seen or u[0] < since:
                    continue
                seen.add(mid)
                out.append((u[0], f.stem) + u[1:])
    return out, titles
