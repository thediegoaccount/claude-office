"""Biblioteca de agentes salvos e agendador: chama especialistas na hora marcada enquanto o servidor estiver aberto."""
import json
import os
import re
import threading
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import cli_bridge
import office

BASE = Path(__file__).resolve().parent
ID_RE = re.compile(r"^[a-f0-9]{12}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
MAX_ITEMS = 60
MIN_INTERVAL = 5          # minutos
GRACE = 15 * 60           # execução perdida há mais que isso é pulada (ex.: servidor estava fechado)
TICK = 20
_lock = threading.RLock()
_thread = None


def path():
    return Path(os.environ.get("CLAUDE_OFFICE_LIBRARY") or BASE / "office_library.json")


def _load():
    try:
        d = json.loads(path().read_text("utf-8"))
        return [x for x in d if isinstance(x, dict) and ID_RE.match(str(x.get("id")))] if isinstance(d, list) else []
    except (OSError, ValueError):
        return []


def _save(items):
    cli_bridge._write_json(path(), items)


def _schedule(raw):
    raw = raw if isinstance(raw, dict) else {}
    kind = raw.get("kind") if raw.get("kind") in ("daily", "interval") else "off"
    if kind == "daily":
        if not TIME_RE.match(str(raw.get("time") or "")):
            raise ValueError("horário inválido (use HH:MM)")
        days = sorted({int(d) for d in raw.get("days") or [] if str(d).isdigit() and 0 <= int(d) <= 6})
        if not days:
            raise ValueError("escolha pelo menos um dia da semana")
        return {"kind": "daily", "time": raw["time"], "days": days}
    if kind == "interval":
        try:
            every = int(raw.get("every_minutes"))
        except (TypeError, ValueError):
            raise ValueError("intervalo inválido") from None
        if not MIN_INTERVAL <= every <= 7 * 24 * 60:
            raise ValueError(f"o intervalo precisa ficar entre {MIN_INTERVAL} minutos e 7 dias")
        return {"kind": "interval", "every_minutes": every}
    return {"kind": "off"}


def next_run(schedule, after):
    """Próxima execução (epoch) depois de `after`, no horário local. None se não houver agendamento."""
    if schedule.get("kind") == "interval":
        return after + schedule["every_minutes"] * 60
    if schedule.get("kind") == "daily":
        hh, mm = map(int, schedule["time"].split(":"))
        base = datetime.fromtimestamp(after)  # noqa: DTZ006 - horário local de propósito
        for add in range(8):
            cand = (base + timedelta(days=add)).replace(hour=hh, minute=mm, second=0, microsecond=0)
            if cand.timestamp() > after and cand.weekday() in schedule["days"]:  # 0 = segunda
                return cand.timestamp()
    return None


def items():
    with _lock:
        return _load()


def save(data):
    """Cria ou atualiza um agente da biblioteca. Devolve o registro salvo."""
    data = data if isinstance(data, dict) else {}
    name = office.clip(data.get("name") or "", 60)
    prompt = str(data.get("prompt") or "").strip()
    if not name:
        raise ValueError("dê um nome ao agente")
    if not prompt or len(prompt) > 20000:
        raise ValueError("a instrução é obrigatória (até 20 mil caracteres)")
    model = cli_bridge._check_model(data.get("model") or None)
    external = cli_bridge.providers.is_external(model, cli_bridge.config())
    cwd = str(data.get("cwd") or "")
    if not external and not cli_bridge._inside_roots(cwd):
        raise PermissionError("a pasta precisa estar dentro de workspace_roots")
    schedule = _schedule(data.get("schedule"))
    now = time.time()
    with _lock:
        all_items = _load()
        cur = next((x for x in all_items if x["id"] == data.get("id")), None)
        if cur is None:
            if len(all_items) >= MAX_ITEMS:
                raise ValueError(f"a biblioteca comporta até {MAX_ITEMS} agentes")
            seed = data.get("look_seed")
            cur = {"id": uuid.uuid4().hex[:12], "created": now, "runs": 0, "last_run": None, "last_error": None,
                   "look_seed": seed if isinstance(seed, str) and cli_bridge.SEED_RE.match(seed) else f"lib-{uuid.uuid4().hex[:10]}"}
            all_items.append(cur)
        seed = data.get("look_seed")
        if isinstance(seed, str) and cli_bridge.SEED_RE.match(seed):
            cur["look_seed"] = seed
        enabled = bool(data.get("enabled", True)) and schedule["kind"] != "off"
        changed = schedule != cur.get("schedule") or enabled != cur.get("enabled")
        cur.update(name=name, prompt=prompt, model=model, cwd=cwd, schedule=schedule, enabled=enabled,
                   orchestrate=bool(data.get("orchestrate")))
        if changed or "next_run" not in cur:
            cur["next_run"] = next_run(schedule, now) if enabled else None
        _save(all_items)
        return dict(cur)


def delete(item_id):
    with _lock:
        all_items = _load()
        keep = [x for x in all_items if x["id"] != item_id]
        if len(keep) == len(all_items):
            raise LookupError("agente não encontrado na biblioteca")
        _save(keep)
    return {"ok": True}


def _mark(item_id, **fields):
    with _lock:
        all_items = _load()
        cur = next((x for x in all_items if x["id"] == item_id), None)
        if cur:
            cur.update(fields)
            _save(all_items)


def run(item_id, scheduled=False):
    """Chama o agente agora, numa sessão nova. Devolve o job."""
    it = next((x for x in items() if x["id"] == item_id), None)
    if not it:
        raise LookupError("agente não encontrado na biblioteca")
    try:
        job = cli_bridge.new_session(it.get("cwd"), it["name"], it["prompt"], False, it.get("model"), it.get("look_seed"),
                                     orchestrate=bool(it.get("orchestrate")))
    except Exception as e:
        _mark(item_id, last_error=office.clip(str(e), 200), last_run=time.time())
        raise
    _mark(item_id, last_error=None, last_run=time.time(), runs=int(it.get("runs") or 0) + 1, last_scheduled=bool(scheduled))
    return job


def tick(now=None):
    """Dispara os agendamentos vencidos. Devolve os ids disparados."""
    now = now or time.time()
    fired = []
    for it in items():
        if not it.get("enabled") or it.get("schedule", {}).get("kind", "off") == "off":
            continue
        due = it.get("next_run")
        if due is None:
            _mark(it["id"], next_run=next_run(it["schedule"], now))
            continue
        if now < due:
            continue
        _mark(it["id"], next_run=next_run(it["schedule"], now))
        if now - due > GRACE:
            _mark(it["id"], last_error="execução pulada: o escritório estava fechado no horário")
            continue
        try:
            run(it["id"], scheduled=True)
            fired.append(it["id"])
        except Exception:  # noqa: BLE001, S110 - o erro já foi gravado em last_error; o agendador segue
            pass
    return fired


def start():
    global _thread
    if _thread and _thread.is_alive():
        return

    def loop():
        while True:
            try:
                tick()
            except Exception:  # noqa: BLE001, S110 - a thread nunca pode derrubar o servidor
                pass
            time.sleep(TICK)
    _thread = threading.Thread(target=loop, daemon=True)
    _thread.start()
