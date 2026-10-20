"""Estado fictício para `python server.py --demo`."""
import time

AGENTS = [
    ("Refatorar pagamentos", "working", "claude-opus-5-5", "Edit", "payments.py", 0.2),
    ("Documentar API", "thinking", "claude-sonnet-5-5", "Read", "routes.md", 0.5),
    ("Investigar job noturno", "waiting", "claude-sonnet-5-5", "say", "Encontrei a causa: o cron roda em UTC.", 13),
    ("Migrar pipeline", "working", "claude-opus-5-5", "Bash", "dbt run --select staging", 0.1),
    ("Revisar PR 482", "waiting", "claude-haiku-5-5", "say", "Revisão concluída, deixei 4 comentários.", 16),
    ("Gerar relatório", "working", "claude-sonnet-5-5", "Write", "relatorio_outubro.md", 0.3),
    ("Corrigir timezone", "thinking", "claude-fable-5-1", "Grep", "tzinfo", 0.4),
    ("Limpar dependências", "away", "claude-haiku-5-5", "Bash", "pip list --outdated", 150),
    ("Treinar modelo", "away", "claude-opus-5-5", "say", "Treino finalizado.", 33),
]


def snapshot(window_hours=24, limit=24, now=None):
    now = now or time.time()
    agents, feed = [], []
    for i, (title, status, model, tool, text, mins) in enumerate(AGENTS):
        sid = f"demo-{i:04d}-0000-0000-0000-000000000000"
        ts = now - mins * 60
        events = [{"ts": ts, "tool": tool, "text": text},
                  {"ts": ts - 40, "tool": "Read", "text": "README.md"},
                  {"ts": ts - 90, "tool": "say", "text": "Vou começar lendo o projeto."}]
        a = {"id": sid, "kind": "session", "title": title, "model": model, "mode": "plan" if title == "Corrigir timezone" else "default", "effort": "medium",
             "cwd": f"C:\\git\\{title.split()[0].lower()}", "workspace": title.split()[0].lower(),
             "created_at": now - 3 * 3600, "last_activity_at": ts, "status": status,
             "current": events[0] if status in ("working", "thinking") else None, "events": events}
        agents.append(a)
        feed.extend(dict(e, agent=sid, name=title) for e in events[:2])
    sub = {"id": agents[0]["id"] + "::demo1", "kind": "subagent", "parent": agents[0]["id"], "title": "Analisar cobertura",
           "model": "claude-sonnet-5-5", "mode": "default", "effort": None, "cwd": agents[0]["cwd"], "workspace": agents[0]["workspace"],
           "created_at": now - 120, "last_activity_at": now - 5, "status": "working",
           "current": {"ts": now - 5, "tool": "Bash", "text": "pytest --cov"}, "events": [{"ts": now - 5, "tool": "Bash", "text": "pytest --cov"}]}
    agents.insert(1, sub)
    feed.append(dict(sub["events"][0], agent=sub["id"], name=sub["title"]))
    feed.sort(key=lambda e: e["ts"], reverse=True)
    return {"now": now, "agents": agents, "feed": feed[:40],
            "source": {"projects": "modo demo (dados fictícios)", "db": "modo demo (dados fictícios)", "exists": True,
                       "total_sessions": len(AGENTS), "latest_activity_at": now - 5}}


def pending(now=None):
    return [{"id": "d" * 32, "session": "demo-0003-0000-0000-0000-000000000000", "tool": "Bash",
             "text": "git push origin feature/x", "detail": "git push origin feature/x", "expires_in": 32.0}]


def usage():
    ranking = [{"id": f"demo-{i:04d}-0000-0000-0000-000000000000", "title": AGENTS[i][0], "model": AGENTS[i][2],
                "spent": v, "today": t, "share": s} for i, v, t, s in [(0, 31.2, 4.1, 36.4), (3, 22.5, 6.0, 26.2),
                                                                        (6, 14.8, 1.2, 17.3), (5, 9.9, 2.2, 11.5), (1, 7.3, 0.4, 8.5)]]
    return {"budget": 200, "spent": 85.7, "remaining": 114.3, "remaining_pct": 57.2, "day": 12, "days_in_month": 31,
            "days_left": 20, "cycle_start": "01/10", "cycle_end": "31/10", "pace_spent": 74.2, "pace_remaining_pct": 62.9,
            "today_spent": 13.9, "daily_allowance": 6.4, "status": "warn", "ranking": ranking, "unit": "usd",
            "cycle_start_day": 1}


def model_costs():
    return {"claude-opus-5-5": 9.8, "claude-sonnet-5-5": 3.1, "claude-haiku-5-5": 0.6, "claude-fable-5-1": 12.5}


def limits():
    now = time.time()
    return {"rows": [{"kind": "five_hour", "group": "session", "label": "Sessão (5 h)", "percent": 38.0, "resets_at": now + 2 * 3600 + 900},
                     {"kind": "seven_day", "group": "weekly", "label": "Semana (7 dias)", "percent": 61.0, "resets_at": now + 3 * 86400},
                     {"kind": "seven_day_opus", "group": "weekly", "label": "Semana (7 dias) · Opus", "percent": 92.0, "resets_at": now + 3 * 86400}],
            "fetched_at": now - 40, "refreshing": False}
