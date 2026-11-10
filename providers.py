"""Provedores externos (API compatível com OpenAI): conversas simples, sem ferramentas, para poupar tokens do Claude."""
import base64
import json
import os
import re
import time
import urllib.error
import urllib.request
import uuid
from datetime import UTC, datetime
from pathlib import Path

import office

BASE = Path(__file__).resolve().parent
EXT_RE = re.compile(r"^([a-z0-9_-]{1,24})/([A-Za-z0-9._:/-]{1,80})$")
URL_RE = re.compile(r"^https?://[^\s]+$")
FOLDER = "chat"
MAX_HISTORY = 40
TIMEOUT = 120
PRESETS = {
    "gemini": {"label": "Google Gemini", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "api_key_env": "GEMINI_API_KEY"},
    "openai": {"label": "OpenAI", "base_url": "https://api.openai.com/v1", "api_key_env": "OPENAI_API_KEY"},
    "groq": {"label": "Groq", "base_url": "https://api.groq.com/openai/v1", "api_key_env": "GROQ_API_KEY"},
    "openrouter": {"label": "OpenRouter", "base_url": "https://openrouter.ai/api/v1", "api_key_env": "OPENROUTER_API_KEY"},
    "ollama": {"label": "Ollama (local)", "base_url": "http://localhost:11434/v1", "api_key_env": "", "no_key": True},
}
MIME = {"png": "image/png", "jpg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}


def chats_dir():
    return Path(os.environ.get("CLAUDE_OFFICE_CHATS") or BASE / "office_chats")


def providers(cfg):
    """Provedores declarados em office.config.json, mesclados com os padrões conhecidos."""
    out = {}
    raw = cfg.get("providers")
    for name, p in (raw.items() if isinstance(raw, dict) else []):
        if not isinstance(p, dict) or not re.match(r"^[a-z0-9_-]{1,24}$", str(name)):
            continue
        d = {"label": name, "base_url": "", "api_key_env": "", **PRESETS.get(name, {}), **p}
        d["models"] = [m for m in d.get("models") or [] if isinstance(m, str) and EXT_RE.match(f"{name}/{m}")]
        if not URL_RE.match(str(d.get("base_url") or "")):
            continue
        d["key"] = str(d.get("api_key") or os.environ.get(str(d.get("api_key_env") or ""), "") or "")
        d["ready"] = bool(d["key"] or d.get("no_key"))
        out[name] = d
    return out


def split(model):
    m = EXT_RE.match(str(model or ""))
    return (m.group(1), m.group(2)) if m else (None, None)


def is_external(model, cfg):
    name, mid = split(model)
    return bool(name) and name in providers(cfg) and mid in providers(cfg)[name]["models"]


def model_groups(cfg):
    return [{"label": p["label"] + ("" if p["ready"] else " · sem chave"), "external": True, "ready": p["ready"],
             "models": [f"{name}/{m}" for m in p["models"]]} for name, p in providers(cfg).items() if p["models"]]


# ---------- transcrição (mesmo formato JSONL do Claude Code, em pasta própria) ----------

def chat_file(sid):
    return chats_dir() / FOLDER / f"{sid}.jsonl"


def is_chat(sid):
    return bool(office.UUID_RE.match(str(sid or ""))) and chat_file(sid).is_file()


def _append(sid, rec):
    f = chat_file(sid)
    f.parent.mkdir(parents=True, exist_ok=True)
    rec = {"uuid": str(uuid.uuid4()), "sessionId": sid, "timestamp": datetime.now(UTC).isoformat(), **rec}
    with open(f, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")


def add_title(sid, title):
    if title:
        _append(sid, {"type": "custom-title", "customTitle": title})


def add_user(sid, text, cwd=None, images=0):
    content = [{"type": "text", "text": text}] if text else []
    content += [{"type": "text", "text": f"({images} imagem(ns) anexada(s))"}] if images else []
    _append(sid, {"type": "user", "cwd": cwd, "message": {"role": "user", "content": content}})


def add_assistant(sid, model, text, error=False):
    _append(sid, {"type": "assistant", "isApiErrorMessage": error,
                  "message": {"role": "assistant", "model": model, "content": [{"type": "text", "text": text}]}})


def history(sid):
    msgs = []
    with open(chat_file(sid), encoding="utf-8") as fh:
        for line in fh:
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if r.get("type") not in ("user", "assistant") or r.get("isApiErrorMessage"):
                continue
            content = (r.get("message") or {}).get("content")
            text = "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text") if isinstance(content, list) else str(content or "")
            if not text:
                continue
            if msgs and msgs[-1]["role"] == r["type"]:
                msgs[-1]["content"] += "\n\n" + text
            else:
                msgs.append({"role": r["type"], "content": text})
    return msgs[-MAX_HISTORY:]


# ---------- chamada ----------

def _explain(code, body):
    try:
        d = json.loads(body)
        d = d[0] if isinstance(d, list) and d else d
        err = d.get("error") if isinstance(d, dict) else None
        msg = err.get("message") if isinstance(err, dict) else err
    except ValueError:
        msg = None
    msg = office.clip(office.mask(msg or body or ""), 300)
    if code == 429:
        return f"limite do provedor atingido (429); espere um pouco ou troque de modelo. {msg}"
    if code in (401, 403):
        return f"chave de API recusada pelo provedor ({code}). {msg}"
    if code == 404:
        return f"modelo ou endereço não encontrado no provedor (404). {msg}"
    return f"o provedor respondeu {code}: {msg}"


def complete(cfg, model, messages, image_paths=()):
    """Chama /chat/completions. Devolve o texto; levanta RuntimeError com mensagem legível em caso de falha."""
    name, mid = split(model)
    p = providers(cfg).get(name)
    if not p or mid not in p["models"]:
        raise RuntimeError("modelo externo não configurado")
    if not p["ready"]:
        raise RuntimeError(f"falta a chave de API de {p['label']}: preencha providers.{name}.api_key em office.config.json"
                           + (f" ou defina {p['api_key_env']}" if p.get("api_key_env") else ""))
    messages = [dict(m) for m in messages]
    if image_paths and messages and messages[-1]["role"] == "user":
        parts = [{"type": "text", "text": messages[-1]["content"]}]
        for path in image_paths:
            ext = Path(path).suffix.lstrip(".")
            data = base64.b64encode(Path(path).read_bytes()).decode()
            parts.append({"type": "image_url", "image_url": {"url": f"data:{MIME.get(ext, 'image/png')};base64,{data}"}})
        messages[-1]["content"] = parts
    if p.get("system"):
        messages.insert(0, {"role": "system", "content": str(p["system"])})
    headers = {"Content-Type": "application/json", "User-Agent": "claude-office"}
    if p["key"]:
        headers["Authorization"] = f"Bearer {p['key']}"
    req = urllib.request.Request(p["base_url"].rstrip("/") + "/chat/completions", method="POST", headers=headers,
                                 data=json.dumps({"model": mid, "messages": messages}).encode())
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:  # base_url validada como http(s)
            d = json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(_explain(e.code, e.read().decode("utf-8", "replace"))) from None
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise RuntimeError(f"falha ao falar com {p['label']}: {office.clip(str(getattr(e, 'reason', e)), 200)}") from None
    try:
        content = d["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError(f"resposta inesperada de {p['label']}: {office.clip(office.mask(json.dumps(d)), 200)}") from None
    if isinstance(content, list):
        content = "".join(b.get("text", "") for b in content if isinstance(b, dict))
    if not content:
        raise RuntimeError(f"{p['label']} devolveu uma resposta vazia")
    return str(content)


def run_turn(cfg, sid, model, image_paths=()):
    """Um turno: lê o histórico, chama o provedor e grava a resposta (ou o erro) na transcrição."""
    t0 = time.time()
    try:
        text = complete(cfg, model, history(sid), image_paths)
    except RuntimeError as e:
        add_assistant(sid, model, f"⚠ {e}", error=True)
        return None, str(e), time.time() - t0
    add_assistant(sid, model, text)
    return text, None, time.time() - t0
