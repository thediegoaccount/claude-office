"""Gerente orquestrador: mede o esforço de cada demanda, escolhe o modelo adequado e divide em até 4 subagentes."""
import json
import re
import threading
import time

import office
import providers

MAX_PARTS = 4
ALIASES = ["haiku", "sonnet", "opus"]
EFFORT_LABEL = {1: "trivial", 2: "leve", 3: "médio", 4: "alto", 5: "máximo"}
_lock = threading.Lock()
_decisions = []
_busy = 0

PROMPT = """Você é o gerente de um escritório de agentes de programação. Sua função é poupar custo sem perder qualidade.
Avalie a demanda abaixo e responda SOMENTE com um objeto JSON, sem nenhum texto antes ou depois:

{{"effort": 1, "model": "nome", "reason": "motivo curto", "parts": []}}

Regras:
- "effort" mede o esforço real da demanda, de 1 a 5: 1 = pergunta simples ou edição trivial; 2 = tarefa pequena e bem definida;
  3 = tarefa comum de programação; 4 = tarefa complexa com várias etapas; 5 = arquitetura, depuração difícil ou mudança ampla.
- "model": o modelo MAIS BARATO da lista que dá conta desse esforço. Se o modelo pedido pelo usuário for maior que o necessário,
  troque por um menor; se for insuficiente, troque por um maior.
- Modelos marcados como "só conversa" não leem arquivos nem executam comandos: use-os apenas para perguntas que não dependem do projeto.
- "reason": até 15 palavras, em português, explicando a escolha.
- "parts": deixe [] quando um único agente resolve. Divida em 2 a {max_parts} partes SOMENTE se elas forem independentes entre si
  e não alterarem os mesmos arquivos. Cada parte é um objeto {{"title": "...", "prompt": "...", "effort": 1, "model": "nome"}} com um
  prompt completo e autossuficiente (o subagente não vê a demanda original), e com esforço e modelo próprios, pelas mesmas regras.

Modelos disponíveis, do mais barato ao mais caro:
{menu}

Modelo pedido pelo usuário: {requested}
{notes}
Demanda:
<<<
{demand}
>>>"""


def settings(cfg):
    raw = cfg.get("orchestrator") if isinstance(cfg.get("orchestrator"), dict) else {}
    try:
        parts = max(1, min(MAX_PARTS, int(raw.get("max_parts", MAX_PARTS))))
    except (TypeError, ValueError):
        parts = MAX_PARTS
    return {"enabled": bool(raw.get("enabled", True)), "model": str(raw.get("model") or "haiku"), "max_parts": parts}


def _rank(model):
    m = model.lower()
    if "/" in m:
        return 0
    return 1 if "haiku" in m else 2 if "sonnet" in m else 3 if "opus" in m else 4 if re.search("fable|mythos", m) else 2.5


def _describe(model):
    m = model.lower()
    if "/" in m:
        return "só conversa (provedor externo, não gasta tokens do Claude)"
    if "haiku" in m:
        return "rápido e barato; esforço 1 a 2"
    if "sonnet" in m:
        return "equilibrado; esforço 2 a 4"
    if "opus" in m:
        return "raciocínio profundo; esforço 4 a 5"
    if re.search("fable|mythos", m):
        return "o mais capaz e o mais caro; só para esforço 5"
    return "modelo configurado"


def menu(cfg):
    """Modelos que o gerente pode escolher, do mais barato ao mais caro."""
    seen, out = set(), []
    extra = [m for m in cfg.get("models") or [] if isinstance(m, str)]
    ext = [m for g in providers.model_groups(cfg) if g["ready"] for m in g["models"]]
    for m in ALIASES + extra + ext:
        if m not in seen:
            seen.add(m)
            out.append(m)
    return sorted(out, key=_rank)


def build_prompt(cfg, demand, requested, has_images=False):
    notes = "Há imagens anexadas: não divida em partes.\n" if has_images else ""
    return PROMPT.format(max_parts=settings(cfg)["max_parts"], requested=requested or "padrão do CLI", notes=notes,
                         menu="\n".join(f"- {m}: {_describe(m)}" for m in menu(cfg)), demand=str(demand)[:12000])


def _effort(v, default=3):
    try:
        return max(1, min(5, int(v)))
    except (TypeError, ValueError):
        return default


def parse(text, allowed, requested, max_parts=MAX_PARTS, allow_split=True):
    """Valida a resposta do gerente. Levanta ValueError se não houver JSON utilizável."""
    m = re.search(r"\{.*\}", str(text or ""), re.DOTALL)
    if not m:
        raise ValueError("o gerente não devolveu JSON")
    d = json.loads(m.group(0))
    if not isinstance(d, dict):
        raise ValueError("resposta do gerente em formato inesperado")  # noqa: TRY004 - tratado como resposta inválida

    def pick(v):
        return v if isinstance(v, str) and v in allowed else requested
    out = {"effort": _effort(d.get("effort")), "model": pick(d.get("model")), "reason": office.clip(d.get("reason") or "", 120), "parts": []}
    parts = d.get("parts") if isinstance(d.get("parts"), list) and allow_split else []
    for p in parts[:max_parts]:
        if isinstance(p, dict) and str(p.get("prompt") or "").strip():
            out["parts"].append({"title": office.clip(p.get("title") or "", 40), "prompt": str(p["prompt"]).strip()[:20000],
                                 "effort": _effort(p.get("effort"), out["effort"]), "model": pick(p.get("model"))})
    if len(out["parts"]) < 2:
        out["parts"] = []
    return out


def triage(cfg, demand, requested, ask, has_images=False):
    """Pergunta ao modelo de triagem e devolve a decisão validada. `ask(model, texto)` devolve a resposta em texto."""
    s = settings(cfg)
    text = ask(s["model"], build_prompt(cfg, demand, requested, has_images))
    return parse(text, set(menu(cfg)), requested, s["max_parts"], allow_split=not has_images)


def summary(title, requested, decision):
    name = f"'{title}'" if title else "demanda"
    req = requested or "padrão do CLI"
    if decision.get("error"):
        return f"{name}: não consegui avaliar ({decision['error']}); segue com {req}"
    if decision["parts"]:
        parts = "; ".join(f"{p['title'] or 'parte'} → {p['model'] or 'padrão'} (esforço {p['effort']}/5)" for p in decision["parts"])
        return f"{name}: esforço {decision['effort']}/5, dividida em {len(decision['parts'])} subagentes: {parts}"
    chosen = decision["model"] or "padrão do CLI"
    change = f"{chosen} no lugar de {req}" if chosen != req else f"{chosen} mantido"
    return f"{name}: esforço {decision['effort']}/5 ({EFFORT_LABEL[decision['effort']]}), {change}" + (f". {decision['reason']}" if decision.get("reason") else "")


def record(title, requested, decision):
    entry = {"ts": time.time(), "title": title, "requested": requested, "text": summary(title, requested, decision), **decision}
    with _lock:
        _decisions.append(entry)
        del _decisions[:-30]
    return entry


def set_busy(delta):
    global _busy
    with _lock:
        _busy = max(0, _busy + delta)


def snapshot():
    with _lock:
        return {"busy": _busy > 0, "decisions": list(_decisions[-10:])[::-1]}


def feed():
    with _lock:
        return [{"ts": d["ts"], "tool": "GERENTE", "text": office.clip(d["text"], 200), "agent": "__manager", "name": "Office (gerente)"}
                for d in _decisions]
