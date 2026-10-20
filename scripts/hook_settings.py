"""Registra/remove o hook PermissionRequest do Claude Office em ~/.claude/settings.json (usado por install_hook.ps1)."""
import json
import os
import shutil
import sys
from pathlib import Path

MARK = "office_permission.py"
SRC = Path(__file__).resolve().parent.parent / "hooks" / MARK


def claude_dir():
    return Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")


def _load(path):
    if not path.is_file():
        return {}
    text = path.read_text("utf-8-sig").strip()
    return json.loads(text) if text else {}


def _strip(entries):
    out = []
    for e in entries if isinstance(entries, list) else []:
        hooks = [h for h in e.get("hooks", []) if MARK not in str(h.get("command", ""))] if isinstance(e, dict) else []
        if hooks:
            out.append({**e, "hooks": hooks})
    return out


def install(uninstall=False):
    base = claude_dir()
    settings_path = base / "settings.json"
    data = _load(settings_path)
    hooks = data.setdefault("hooks", {})
    entries = _strip(hooks.get("PermissionRequest"))
    dst = base / "hooks" / MARK
    if uninstall:
        try:
            dst.unlink()
        except OSError:
            pass
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SRC, dst)
        entries.append({"matcher": "", "hooks": [{"type": "command", "command": f'python "{dst}"', "timeout": 45}]})
    if entries:
        hooks["PermissionRequest"] = entries
    else:
        hooks.pop("PermissionRequest", None)
    if not hooks:
        data.pop("hooks", None)
    base.mkdir(parents=True, exist_ok=True)
    tmp = settings_path.with_suffix(".json.tmp")
    tmp.write_bytes(json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))
    os.replace(tmp, settings_path)
    return settings_path, dst


if __name__ == "__main__":
    off = "--uninstall" in sys.argv
    sp, dst = install(off)
    print(("Hook removido de " if off else f"Hook instalado em {dst}\nRegistrado em ") + str(sp))
    if not off:
        print("Abra uma sessão NOVA do Claude Code para o hook valer.")
