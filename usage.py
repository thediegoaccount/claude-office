"""Consumo do ciclo de cobrança, ranking e custo médio por modelo (a partir de message.usage)."""
import calendar
import time
from datetime import date, datetime, timedelta

import office


def _day(y, m, d):
    return date(y, m, min(d, calendar.monthrange(y, m)[1]))


def _shift(y, m, k):
    m += k
    return y + (m - 1) // 12, (m - 1) % 12 + 1


def cycle_bounds(day0, start_day):
    start = _day(day0.year, day0.month, start_day)
    if day0 < start:
        y, m = _shift(day0.year, day0.month, -1)
        start = _day(y, m, start_day)
    y, m = _shift(start.year, start.month, 1)
    return start, _day(y, m, start_day)


def _ts(d):
    return datetime(d.year, d.month, d.day).timestamp()


def price_for(model, prices):
    model = (model or "").lower()
    keys = [k for k in prices if k != "default" and k.lower() in model]
    return prices[max(keys, key=len)] if keys else prices.get("default")


def cost(entry, prices, unit="usd"):
    _, _, model, inp, out, cw, cr = entry
    if unit == "tokens":
        return float(inp + out + cw + cr)
    p = price_for(model, prices or {})
    if not p:
        return 0.0
    return (inp * p.get("input", 0) + out * p.get("output", 0) + cw * p.get("cache_write", 0) + cr * p.get("cache_read", 0)) / 1e6


def compute(budget, cycle_start_day, now=None, entries=None, prices=None, unit="usd", titles=None):
    now = now or time.time()
    today = datetime.fromtimestamp(now).date()
    start, end = cycle_bounds(today, cycle_start_day)
    s_ts, e_ts, t_ts = _ts(start), _ts(end), _ts(today)
    titles = titles or {}
    spent = today_spent = 0.0
    per = {}
    for e in entries or []:
        if not (s_ts <= e[0] < e_ts):
            continue
        c = cost(e, prices, unit)
        spent += c
        row = per.setdefault(e[1], [0.0, 0.0])
        row[0] += c
        if e[0] >= t_ts:
            today_spent += c
            row[1] += c
    days = (end - start).days
    days_left = (end - today).days
    frac = min(1.0, max(0.0, (now - s_ts) / (e_ts - s_ts)))
    pace = budget * frac
    daily = max(0.0, budget - (spent - today_spent)) / max(1, days_left)
    status = "ok" if spent <= pace else "warn" if spent <= pace + daily else "danger"
    ranking = []
    for sid, (sp, td) in sorted(per.items(), key=lambda kv: kv[1][0], reverse=True):
        if sp <= 0:
            continue
        t = titles.get(sid) or (sid, None, None)
        ranking.append({"id": sid, "title": t[0], "model": t[1], "spent": round(sp, 4), "today": round(td, 4),
                        "share": round(100 * sp / spent, 1) if spent else 0})
        if len(ranking) == 5:
            break
    remaining = budget - spent
    return {"budget": budget, "spent": round(spent, 4), "remaining": round(remaining, 4),
            "remaining_pct": round(100 * remaining / budget, 1) if budget else 0,
            "day": (today - start).days + 1, "days_in_month": days, "days_left": days_left,
            "cycle_start": start.strftime("%d/%m"), "cycle_end": (end - timedelta(days=1)).strftime("%d/%m"),
            "pace_spent": round(pace, 4), "pace_remaining_pct": round(100 * (budget - pace) / budget, 1) if budget else 0,
            "today_spent": round(today_spent, 4), "daily_allowance": round(daily, 4), "status": status, "ranking": ranking, "unit": unit}


def model_costs(entries, prices, unit="usd", titles=None):
    per = {}
    for e in entries:
        model = ((titles or {}).get(e[1]) or (None, e[2]))[1] or e[2]
        per.setdefault(model, {}).setdefault(e[1], 0.0)
        per[model][e[1]] += cost(e, prices, unit)
    return {m: round(sum(s.values()) / len(s), 4) for m, s in per.items() if m and s}


def report(cfg, root=None, now=None):
    now = now or time.time()
    unit = cfg.get("budget_unit", "usd")
    start, _ = cycle_bounds(datetime.fromtimestamp(now).date(), int(cfg.get("cycle_start_day", 1)))
    since = min(_ts(start), now - 60 * 86400)
    entries, titles = office.usage_entries(since, root)
    cyc = compute(float(cfg.get("monthly_budget", 100)), int(cfg.get("cycle_start_day", 1)), now, entries,
                  cfg.get("prices") or {}, unit, titles)
    return cyc, model_costs([e for e in entries if e[0] >= now - 60 * 86400], cfg.get("prices") or {}, unit, titles)
