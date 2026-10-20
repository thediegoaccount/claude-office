"""Ponte com o CLI `claude`: login, novas sessões, comandos, imagens e cancelamento."""
import base64
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

import office

BASE = Path(__file__).resolve().parent
MODEL_RE = re.compile(r"^[A-Za-z0-9._\[\]-]{2,80}$")
SEED_RE = re.compile(r"^[a-z0-9-]{1,40}$")
ALIASES = ["sonnet", "opus", "haiku"]
MAX_IMAGES, MAX_IMAGE_BYTES = 5, 5 * 1024 * 1024
JOB_TIMEOUT = 3600
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
NEW_CONSOLE = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
PLAN_PREFIX = ("[MODO PLANO] Antes de executar qualquer ação que altere arquivos, rode comandos com efeito ou faça chamadas "
               "externas, apresente um plano numerado (passos, arquivos afetados, riscos) e PARE. Só pode ler arquivos para "
               "planejar. Só execute depois que eu responder aprovando o plano.\n\nPedido:\n")
IMAGE_NOTE = ("As imagens acima foram coladas pelo usuário e estão salvas nesses caminhos; abra cada uma com a ferramenta "
              "de leitura de arquivos antes de responder.")
NO_OUTPUT = "o agente não produziu resposta; talvez tenha tentado uma ação que exige aprovação (veja o balão PERMITIR)"
_lock = threading.Lock()
_jobs = {}
_busy = {}
_cache = {}


# ---------- configuração ----------

def config_path():
    return Path(os.environ.get("CLAUDE_OFFICE_CONFIG") or BASE / "office.config.json")


def names_path():
    return Path(os.environ.get("CLAUDE_OFFICE_NAMES") or BASE / "office_names.json")


def _desktop():
    for env in ("OneDrive", "OneDriveConsumer", "OneDriveCommercial"):
        if os.environ.get(env) and (Path(os.environ[env]) / "Desktop").is_dir():
            return Path(os.environ[env]) / "Desktop"
    return Path.home() / "Desktop"


def defaults():
    return {"workspace_roots": [str(_desktop() / "git")], "claude_bin": "", "permission_mode": "default",
            "budget_unit": "usd", "monthly_budget": 100, "cycle_start_day": 1, "prices": {}, "models": []}


def _raw():
    try:
        d = json.loads(config_path().read_text("utf-8"))
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_json(path, data):
    tmp = Path(str(path) + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def config():
    cfg = {**defaults(), **_raw()}
    if not cfg.get("prices"):
        try:
            cfg["prices"] = json.loads((BASE / "office.config.example.json").read_text("utf-8")).get("prices") or {}
        except (OSError, ValueError):
            cfg["prices"] = {}
    return cfg


def load_names():
    try:
        d = json.loads(names_path().read_text("utf-8"))
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _save_name(sid, entry):
    with _lock:
        names = load_names()
        names[sid] = {**names.get(sid, {}), **entry}
        _write_json(names_path(), names)


# ---------- executável ----------

def _version_key(p):
    return [int(x) if x.isdigit() else 0 for x in re.split(r"[.\\/]", p)]


def claude_candidates():
    home = Path(os.environ.get("USERPROFILE") or Path.home())
    roaming = Path(os.environ.get("APPDATA") or home / "AppData" / "Roaming")
    local = Path(os.environ.get("LOCALAPPDATA") or home / "AppData" / "Local")
    fixed = [home / ".local" / "bin" / "claude.exe", home / ".claude" / "local" / "claude.exe", roaming / "npm" / "claude.cmd",
             local / "Programs" / "claude" / "claude.exe"]
    bundled = sorted(glob.glob(str(roaming / "Claude" / "claude-code" / "*" / "*" / "claude.exe")), key=_version_key, reverse=True)
    return [str(p) for p in fixed] + bundled


def find_claude():
    for c in (config().get("claude_bin"), os.environ.get("CLAUDE_BIN")):
        if c and Path(c).is_file():
            return str(c)
    w = shutil.which("claude")
    if w:
        return w
    return next((c for c in claude_candidates() if Path(c).is_file()), None)


def _argv(path):
    return [sys.executable, path] if path.endswith(".py") else [path]


def _run(args, timeout=30, cwd=None):
    path = find_claude()
    if not path:
        raise FileNotFoundError("claude não encontrado")
    return subprocess.run(_argv(path) + args, capture_output=True, text=True, encoding="utf-8", errors="replace",
                          stdin=subprocess.DEVNULL, timeout=timeout, cwd=cwd, creationflags=NO_WINDOW, check=False)


def _cached(key, ttl, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    return val


def auth_status(recheck=False):
    if recheck:
        _cache.pop("auth", None)

    def go():
        try:
            r = _run(["auth", "status"], timeout=20)
        except (OSError, subprocess.TimeoutExpired) as e:
            return {"state": "unavailable", "logged_in": False, "message": f"CLI indisponível: {e}"}
        text = (r.stdout or "") + (r.stderr or "")
        try:
            d = json.loads(r.stdout)
        except ValueError:
            d = {}
        method = d.get("authMethod") if isinstance(d, dict) else None
        if r.returncode == 0 and method and method != "none" and d.get("loggedIn", True):
            return {"state": "ok", "logged_in": True, "method": method, "message": f"logado via {method}"}
        if re.search(r"(?i)expired|401|invalid token|re-?authenticate", text):
            return {"state": "expired", "logged_in": False, "message": "login expirado"}
        return {"state": "absent", "logged_in": False, "message": "sem login"}
    return _cached("auth", 60, go)


def cli_info():
    def go():
        path = find_claude()
        if not path:
            return {"available": False, "path": None, "version": None, "flags": {}, "modes": []}
        try:
            ver = _run(["--version"], timeout=20).stdout.strip()
            help_text = _run(["--help"], timeout=20).stdout
        except (OSError, subprocess.TimeoutExpired):
            return {"available": False, "path": path, "version": None, "flags": {}, "modes": []}
        m = re.search(r"--permission-mode.*?\(choices:([^)]*)\)", help_text, re.DOTALL)
        modes = re.findall(r'"([A-Za-z]+)"', m.group(1)) if m else []
        flags = {f: f in help_text for f in ("--session-id", "--name", "--permission-mode", "--output-format", "--model", "--resume")}
        return {"available": True, "path": path, "version": ver, "flags": flags, "modes": modes}
    info = _cached("info", 600, go)
    if not info["available"]:
        _cache.pop("info", None)
    return info


def auth_action(action):
    if action not in ("login", "logout"):
        raise ValueError("ação inválida")
    path = find_claude()
    if not path:
        raise RuntimeError("claude não encontrado")
    _cache.pop("auth", None)
    if action == "logout":
        r = _run(["auth", "logout"], timeout=30)
        return {"ok": r.returncode == 0}
    subprocess.Popen(_argv(path) + ["auth", "login"], creationflags=NEW_CONSOLE, stdin=None)
    return {"ok": True, "message": "Uma janela de login foi aberta; conclua o login nela."}


def models():
    extra = [m for m in config().get("models") or [] if isinstance(m, str) and MODEL_RE.match(m)]
    return {"default": "padrão do CLI", "groups": [{"label": "Apelidos", "models": ALIASES},
                                                    {"label": "Configurados", "models": extra}]}


def _check_model(model):
    if not model:
        return None
    allowed = set(ALIASES) | {g for g in config().get("models") or [] if isinstance(g, str)}
    if not MODEL_RE.match(model) or model not in allowed:
        raise ValueError("modelo inválido")
    return model


# ---------- pastas ----------

def roots():
    return [Path(r) for r in config().get("workspace_roots") or [] if r]


def workspaces():
    out = []
    for r in roots():
        if not r.is_dir():
            continue
        out.append(str(r))
        try:
            for sub in sorted(p for p in r.iterdir() if p.is_dir() and not p.name.startswith(".")):
                out.append(str(sub))
                if not (sub / ".git").exists():
                    for sub2 in sorted(p for p in sub.iterdir() if p.is_dir() and (p / ".git").exists()):
                        out.append(str(sub2))
        except OSError:
            continue
    return out


def _inside_roots(cwd):
    try:
        p = Path(cwd).resolve()
    except (OSError, ValueError):
        return False
    return p.is_dir() and any(p == r.resolve() or r.resolve() in p.parents for r in roots() if r.is_dir())


# ---------- imagens ----------

def images_dir():
    env = os.environ.get("CLAUDE_OFFICE_TMP")
    return Path(env) / "images" if env else Path(tempfile.gettempdir()) / "claude-office-images"


def _image_ext(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def save_images(images):
    images = images or []
    if len(images) > MAX_IMAGES:
        raise ValueError(f"no máximo {MAX_IMAGES} imagens")
    decoded = []
    for i, img in enumerate(images, 1):
        s = str(img)
        if s.startswith("data:"):
            s = s.split(",", 1)[-1]
        try:
            data = base64.b64decode(s, validate=True)
        except ValueError:
            raise ValueError(f"imagem {i} inválida") from None
        ext = _image_ext(data)
        if not ext or len(data) > MAX_IMAGE_BYTES:
            raise ValueError(f"imagem {i} inválida (PNG, JPEG, GIF ou WEBP até 5 MB)")
        decoded.append((data, ext))
    d = images_dir()
    d.mkdir(parents=True, exist_ok=True)
    for old in d.glob("office-*"):
        try:
            if time.time() - old.stat().st_mtime > 7 * 86400:
                old.unlink()
        except OSError:
            pass
    uid, paths = uuid.uuid4().hex[:12], []
    for n, (data, ext) in enumerate(decoded, 1):
        p = d / f"office-{uid}-{n}.{ext}"
        p.write_bytes(data)
        paths.append(str(p))
    return paths


def build_prompt(prompt, plan_prefix, paths):
    prompt = (prompt or "").strip()
    if not prompt and not paths:
        raise ValueError("mensagem vazia")
    head = ""
    if paths:
        head = " ".join(f"[Image {i}: {p}]" for i, p in enumerate(paths, 1)) + "\n" + IMAGE_NOTE + "\n\n"
    return (PLAN_PREFIX if plan_prefix else "") + head + prompt


# ---------- execução ----------

def _mode_args(plan):
    info = cli_info()
    modes = info.get("modes") or []
    if plan and "plan" in modes:
        return ["--permission-mode", "plan"], False
    mode = config().get("permission_mode") or "default"
    args = ["--permission-mode", mode] if mode in modes and info["flags"].get("--permission-mode") else []
    return args, bool(plan)


def _explain(text, exit_code):
    if re.search(r"(?i)not logged in|please run /login|no credentials|login required", text):
        return "O Claude Code não está logado nesta máquina. Clique no selo CLI para entrar."
    if re.search(r"(?i)expired|401|invalid token|re-?authenticate", text):
        return "O login do Claude Code expirou. Clique no selo CLI para entrar de novo."
    if re.search(r"(?i)already in use|is locked|session .* (busy|running)", text):
        return "A sessão parece travada ou já está em uso em outro lugar."
    return f"o CLI terminou com código {exit_code}: {office.clip(office.mask(text), 300)}" if text.strip() else NO_OUTPUT


def _finish(job, proc, out, err):
    job["exit_code"] = proc.returncode
    job["finished"] = time.time()
    job["running"] = False
    try:
        d = json.loads(out)
    except ValueError:
        d = None
    if isinstance(d, dict):
        job["output"] = office.mask(str(d.get("result") or ""))[:20000]
        job["session"] = d.get("session_id") or job["session"]
        job["incomplete"] = d.get("subtype") not in (None, "success")
        if d.get("is_error"):
            job["error"] = _explain(job["output"] + (err or ""), proc.returncode)
        elif not job["output"]:
            job["error"] = NO_OUTPUT
    elif not job["cancelled"]:
        job["output"] = office.mask(out or "")[:20000]
        job["incomplete"] = True
        job["error"] = _explain((out or "") + (err or ""), proc.returncode) if proc.returncode or not out else None


def _runner(job, args, cwd, prompt):
    fd, tmp = tempfile.mkstemp(prefix="office-prompt-", suffix=".txt")
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as fh:
        fh.write(prompt)
    try:
        with open(tmp, "rb") as stdin:
            proc = subprocess.Popen(_argv(find_claude()) + args, stdin=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    cwd=cwd, creationflags=NO_WINDOW)
            job["_proc"] = proc
            try:
                out, err = proc.communicate(timeout=JOB_TIMEOUT)
            except subprocess.TimeoutExpired:
                proc.kill()
                out, err = proc.communicate()
                job["error"] = "A sessão parece travada (sem resposta em 1 h); o processo foi encerrado."
        _finish(job, proc, out.decode("utf-8", "replace"), err.decode("utf-8", "replace"))
    except OSError as e:
        job.update(running=False, finished=time.time(), error=f"falha ao iniciar o CLI: {e}")
    finally:
        job.pop("_proc", None)
        with _lock:
            _busy.pop(job["session"], None)
            _busy.pop(job.get("_key"), None)
        try:
            os.unlink(tmp)
        except OSError:
            pass


def _start(kind, key, args, cwd, prompt, title, model, images):
    auth = auth_status()
    if not auth["logged_in"]:
        raise RuntimeError("O Claude Code não está logado (ou o login expirou). Clique no selo CLI para entrar.")
    with _lock:
        if key in _busy:
            raise RuntimeError("essa sessão já está executando um comando; espere terminar ou cancele")
        jid = uuid.uuid4().hex[:12]
        job = {"id": jid, "kind": kind, "session": key, "title": title, "model": model, "images": len(images),
               "started": time.time(), "finished": None, "exit_code": None, "error": None, "output": "",
               "incomplete": False, "cancelled": False, "running": True, "_key": key}
        _jobs[jid] = job
        _busy[key] = jid
        while len(_jobs) > 50:
            _jobs.pop(next(iter(_jobs)))
    threading.Thread(target=_runner, args=(job, args, cwd, prompt), daemon=True).start()
    return public(job)


def public(job):
    return {k: v for k, v in job.items() if not k.startswith("_")}


def new_session(cwd, title, prompt, plan=False, model=None, look_seed=None, images=None):
    if not find_claude():
        raise RuntimeError("claude não encontrado")
    if not cwd or not _inside_roots(cwd):
        raise PermissionError("a pasta precisa estar dentro de workspace_roots")
    title = office.clip(title or "", 60)
    model = _check_model(model)
    seed = look_seed if isinstance(look_seed, str) and SEED_RE.match(look_seed) else None
    paths = save_images(images)
    mode_args, prefix = _mode_args(plan)
    info = cli_info()
    sid = str(uuid.uuid4())
    args = ["-p"] + (["--session-id", sid] if info["flags"].get("--session-id") else [])
    if title and info["flags"].get("--name"):
        args += ["-n", title]
    args += mode_args + (["--model", model] if model else []) + ["--output-format", "json"]
    _save_name(sid, {"title": title, "origin": "office", "created": time.time(), "look_seed": seed})
    return _start("new", sid, args, str(Path(cwd).resolve()), build_prompt(prompt, prefix, paths), title, model, paths)


def send(session_id, prompt, plan=False, model=None, images=None):
    path, _ = office.find_session_file(str(session_id or ""))
    if "::" in session_id:
        raise ValueError("não é possível enviar comandos para um subagente")
    p = office.load(path)
    if not p.cwd or not Path(p.cwd).is_dir():
        raise ValueError("pasta da sessão não encontrada")
    model = _check_model(model)
    paths = save_images(images)
    mode_args, prefix = _mode_args(plan)
    args = ["-p", "-r", session_id] + mode_args + (["--model", model] if model else []) + ["--output-format", "json"]
    job = _start("send", session_id, args, p.cwd, build_prompt(prompt, prefix, paths), None, model, paths)
    origin = load_names().get(session_id, {}).get("origin")
    if origin != "office" and p.last_ts and time.time() - p.last_ts < 600:
        job["warning"] = ("Esta sessão teve atividade recente fora do escritório. Se ela estiver aberta num terminal "
                          "interativo, o histórico pode se misturar; feche-a antes de continuar.")
    return job


def cancel(job_id):
    job = _jobs.get(str(job_id))
    if not job:
        raise LookupError("execução não encontrada")
    proc = job.get("_proc")
    job["cancelled"] = True
    if proc and proc.poll() is None:
        proc.kill()
    return public(job)


def busy():
    with _lock:
        return dict(_busy)


# ---------- limites do plano (/usage) ----------

LIMITS_TTL = 180
_limits = {"data": None, "running": False}


def _epoch(v):
    if v in (None, ""):
        return None
    if isinstance(v, (int, float)):
        return float(v) / 1000 if v > 1e12 else float(v)
    try:
        return datetime.fromisoformat(str(v)).timestamp()
    except ValueError:
        return None


def limit_label(row):
    key = f"{row.get('kind') or ''} {row.get('group') or ''}".lower()
    if any(s in key for s in ("five_hour", "5h", "5_hour", "session")):
        base = "Sessão (5 h)"
    elif any(s in key for s in ("seven_day", "7d", "week")):
        base = "Semana (7 dias)"
    else:
        base = str(row.get("kind") or row.get("group") or "limite")
    scope = row.get("scope") or {}
    extra = [(scope.get("model") or {}).get("display_name"), (scope.get("surface") or {}).get("display_name")]
    return " · ".join([base] + [e for e in extra if e])


def parse_usage_report(stdout):
    """Extrai rate_limits do usage_report devolvido por `/usage` em stream-json. None se não houver."""
    for line in (stdout or "").splitlines():
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if not isinstance(d, dict) or d.get("type") != "assistant":
            continue
        ur = d.get("usage_report") or (d.get("message") or {}).get("usage_report")
        if not isinstance(ur, dict):
            continue
        rl = ur.get("rate_limits")
        if not isinstance(rl, dict):
            return {"rows": [], "extra_usage": None}
        rows = []
        for r in rl.get("limits") or []:
            if not isinstance(r, dict):
                continue
            pct = r.get("percent")
            rows.append({"kind": r.get("kind"), "group": r.get("group"), "label": limit_label(r),
                         "percent": float(pct) if isinstance(pct, (int, float)) else None, "resets_at": _epoch(r.get("resets_at")),
                         "severity": r.get("severity"), "is_active": r.get("is_active")})
        return {"rows": rows, "extra_usage": rl.get("extra_usage")}
    return None


def probe_limits():
    path = find_claude()
    if not path:
        return {"rows": [], "reason": "claude não encontrado; instale o CLI do Claude Code: irm https://claude.ai/install.ps1 | iex"}
    auth = auth_status()
    if not auth["logged_in"]:
        return {"rows": [], "reason": "o CLI do Claude está sem login: clique no selo CLI para entrar"}
    msg = json.dumps({"type": "user", "message": {"role": "user", "content": "/usage"}}) + "\n"
    try:
        r = subprocess.run(_argv(path) + ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
                                          "--no-session-persistence"], input=msg, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=90, cwd=tempfile.gettempdir(), creationflags=NO_WINDOW, check=False)
    except (OSError, subprocess.TimeoutExpired) as e:
        return {"rows": [], "reason": f"falha ao consultar /usage: {e}"}
    parsed = parse_usage_report(r.stdout)
    if parsed is None:
        return {"rows": [], "reason": "o CLI não devolveu os limites do plano (é preciso login claude.ai Pro/Max/Team)"}
    if not parsed["rows"]:
        parsed["reason"] = "o Claude não informou limites para esta conta"
    return parsed


def _refresh_limits():
    try:
        data = probe_limits()
    except Exception as e:  # noqa: BLE001 - a thread nunca pode derrubar o servidor
        data = {"rows": [], "reason": f"erro: {e}"}
    data["fetched_at"] = time.time()
    _limits["data"] = data
    _limits["running"] = False


def limits_snapshot(force=False):
    d = _limits["data"]
    stale = force or d is None or time.time() - d.get("fetched_at", 0) > LIMITS_TTL
    if stale and not _limits["running"]:
        _limits["running"] = True
        threading.Thread(target=_refresh_limits, daemon=True).start()
    out = dict(d) if d else {"rows": [], "reason": "consultando os limites do plano…"}
    out["refreshing"] = _limits["running"]
    now = time.time()
    out["rows"] = [dict(r, percent=0.0, reset_passed=True) if r.get("resets_at") and r["resets_at"] <= now else r for r in out.get("rows", [])]
    return out


def status(recheck=False):
    if recheck:
        _limits["data"] = None
    info = cli_info() if not recheck else (_cache.pop("info", None), cli_info())[1]
    auth = auth_status(recheck) if info["available"] else {"state": "unavailable", "logged_in": False,
                                                           "message": "claude não encontrado; instale o CLI do Claude Code: irm https://claude.ai/install.ps1 | iex"}
    return {"available": info["available"], "logged_in": auth["logged_in"], "auth_state": auth["state"],
            "auth_message": auth["message"], "path": info["path"], "version": info["version"], "modes": info.get("modes", []),
            "workspaces": workspaces(), "roots": [str(r) for r in roots()],
            "jobs": [public(j) for j in list(_jobs.values())[-20:]][::-1]}
