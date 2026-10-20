"""CLI `claude` falso para os testes (apontado por CLAUDE_BIN). Comportamento controlado por variáveis FAKE_*."""
import json
import os
import sys
import time

HELP = """Usage: claude [options] [command] [prompt]
Options:
  -p, --print                 Print response and exit
  -r, --resume [value]        Resume a conversation
  --session-id <uuid>         Use a specific session ID
  -n, --name <name>           Set a display name
  --model <model>             Model for the current session
  --output-format <format>    Output format
  --permission-mode <mode>    Permission mode to use for the session
                              (choices: "acceptEdits", "auto", "bypassPermissions", "manual",
                              "dontAsk", "plan")
  --setting-sources <list>    Sources (choices: "host", "none")
  --no-session-persistence    Disable session persistence
"""


def main():
    args = sys.argv[1:]
    if args == ["--version"]:
        print("9.9.9 (Claude Code)")
        return 0
    if args == ["--help"]:
        print(HELP)
        return 0
    if args[:2] == ["auth", "status"]:
        state = os.environ.get("FAKE_AUTH", "ok")
        if state == "ok":
            print(json.dumps({"loggedIn": True, "authMethod": "claude.ai"}))
            return 0
        if state == "expired":
            print("OAuth token expired; please re-authenticate", file=sys.stderr)
            return 1
        print(json.dumps({"loggedIn": False, "authMethod": "none"}))
        return 1
    if args[:1] == ["auth"]:
        return 0
    prompt = sys.stdin.buffer.read().decode("utf-8")
    if "--input-format" in args:
        mode = os.environ.get("FAKE_USAGE", "report")
        msg = {"type": "assistant", "message": {"role": "assistant", "content": [{"type": "text", "text": "uso"}]}}
        if mode == "report":
            msg["usage_report"] = {"session": {}, "rate_limits": {"limits": [
                {"kind": "five_hour", "group": "session", "percent": 23.5, "resets_at": "2030-01-01T10:00:00+00:00", "severity": "normal", "is_active": True},
                {"kind": "seven_day", "group": "weekly", "percent": 41, "resets_at": 1893456000, "severity": "normal", "is_active": True},
                {"kind": "seven_day_model", "group": "weekly", "percent": 90, "resets_at": None, "scope": {"model": {"display_name": "Opus"}},
                 "severity": "warning", "is_active": True}]}}
        elif mode == "null":
            msg["usage_report"] = {"session": {}, "rate_limits": None}
        for d in ({"type": "system", "subtype": "init"}, msg, {"type": "result", "subtype": "success"}):
            print(json.dumps(d))
        return 0
    log = os.environ.get("FAKE_LOG")
    if log:
        with open(log, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"args": args, "cwd": os.getcwd(), "prompt": prompt}) + "\n")
    time.sleep(float(os.environ.get("FAKE_SLEEP") or 0))
    if os.environ.get("FAKE_MODE") == "empty":
        print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": "", "session_id": "x"}))
        return 0
    sid = args[args.index("--session-id") + 1] if "--session-id" in args else args[args.index("-r") + 1]
    print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": f"ok token=segredo {prompt[-20:]}", "session_id": sid}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
