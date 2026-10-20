import json
from datetime import date, datetime

import pytest

import cli_bridge
import usage


def ts(y, m, d, h=12):
    return datetime(y, m, d, h).timestamp()


def test_cycle_bounds():
    assert usage.cycle_bounds(date(2026, 10, 20), 23) == (date(2026, 9, 23), date(2026, 10, 23))
    assert usage.cycle_bounds(date(2026, 10, 23), 23) == (date(2026, 10, 23), date(2026, 11, 23))
    assert usage.cycle_bounds(date(2026, 12, 30), 23) == (date(2026, 12, 23), date(2027, 1, 23))
    assert usage.cycle_bounds(date(2026, 2, 28), 31) == (date(2026, 2, 28), date(2026, 3, 31))
    assert usage.cycle_bounds(date(2026, 2, 15), 31) == (date(2026, 1, 31), date(2026, 2, 28))


def test_compute_pace_status_ranking():
    prices = {"opus": {"input": 0, "output": 1_000_000, "cache_write": 0, "cache_read": 0}}
    now = ts(2026, 10, 16, 0)  # metade de outubro (ciclo 01/10–31/10)
    e = lambda t, sid, usd: (t, sid, "claude-opus-5-5", 0, int(usd), 0, 0)
    entries = [e(ts(2026, 10, 2), "a", 30), e(ts(2026, 10, 3), "b", 10), e(ts(2026, 9, 30), "a", 999)]
    r = usage.compute(100, 1, now, entries, prices, "usd", {"a": ("A", "claude-opus-5-5", None)})
    assert r["spent"] == 40 and r["remaining"] == 60 and r["day"] == 16 and r["days_in_month"] == 31
    assert r["cycle_start"] == "01/10" and r["cycle_end"] == "31/10"
    assert r["pace_spent"] == pytest.approx(100 * 15 / 31, rel=1e-3) and r["status"] == "ok"
    assert [x["id"] for x in r["ranking"]] == ["a", "b"] and r["ranking"][0]["share"] == 75.0
    r2 = usage.compute(100, 1, now, entries + [e(now + 60, "b", 10)], prices)
    assert r2["status"] == "warn" and r2["today_spent"] == 10
    r3 = usage.compute(100, 1, now, entries + [e(now + 60, "b", 40)], prices)
    assert r3["status"] == "danger"
    t = usage.compute(1000, 1, now, [(ts(2026, 10, 2), "a", "x", 1, 2, 3, 4)], {}, "tokens")
    assert t["spent"] == 10 and t["unit"] == "tokens"


def test_price_lookup_longest_match():
    p = json.loads((cli_bridge.BASE / "office.config.example.json").read_text("utf-8"))["prices"]
    assert usage.price_for("claude-opus-5-5", p)["input"] == 4.0
    assert usage.price_for("claude-opus-5", p)["input"] == 5.0
    assert usage.price_for("claude-haiku-4-5-20251001", p)["input"] == 1.0
    assert usage.price_for("algo-novo", p) == p["default"]


def test_model_costs():
    prices = {"default": {"input": 1_000_000, "output": 0, "cache_write": 0, "cache_read": 0}}
    entries = [(1, "a", "m1", 2, 0, 0, 0), (2, "b", "m1", 4, 0, 0, 0), (3, "c", "m2", 1, 0, 0, 0)]
    assert usage.model_costs(entries, prices) == {"m1": 3.0, "m2": 1.0}
