#!/usr/bin/env python3
"""Terminate stale Cursor / agent shell processes (macOS).

Reads live PIDs from ~/.cursor/projects/*/terminals/*.txt when still active.
Safe defaults: SIGTERM first; optional SIGKILL for survivors.
"""
from __future__ import annotations

import argparse
import os
import re
import signal
import subprocess
import sys
from pathlib import Path

CURSOR_MARKERS = ("Cursor", "cursor", "pty-host", "extension-host")
SHELL_MARKERS = ("/bin/zsh", "/bin/bash", "bash ", "zsh ")
AGENT_SHELL = "/bin/zsh -c"
INTERACTIVE_SHELL = "/bin/zsh -il"
ORPHAN_PATTERNS = (
    "bash ./li-tests/run_httpd_config.sh",
    "bash ./bin/lis db start",
)


def etime_seconds(etime: str) -> int:
    etime = etime.strip()
    days = 0
    if "-" in etime:
        d, etime = etime.split("-", 1)
        days = int(d)
    parts = [int(p) for p in etime.split(":")]
    if len(parts) == 3:
        h, m, s = parts
    elif len(parts) == 2:
        h, m, s = 0, parts[0], parts[1]
    else:
        return 0
    return days * 86400 + h * 3600 + m * 60 + s


def is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False


def load_ps() -> list[tuple[int, int, str, str]]:
    out = subprocess.check_output(
        ["ps", "-axo", "pid=,ppid=,etime=,command="], text=True
    )
    rows: list[tuple[int, int, str, str]] = []
    for line in out.splitlines():
        m = re.match(r"\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)", line)
        if m:
            rows.append((int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)))
    return rows


def cursor_linked(rows: list[tuple[int, int, str, str]], pid: int) -> bool:
    by_pid = {r[0]: r for r in rows}
    seen: set[int] = set()
    cur = pid
    while cur and cur not in seen:
        seen.add(cur)
        r = by_pid.get(cur)
        if not r:
            break
        if any(m in r[3] for m in CURSOR_MARKERS):
            return True
        cur = r[1]
    return False


def protect_from_terminal_logs() -> set[int]:
    protect: set[int] = set()
    root = Path.home() / ".cursor" / "projects"
    pid_re = re.compile(r"^pid:\s*(\d+)", re.M)
    ended_re = re.compile(r"^ended_at:", re.M)
    exit_re = re.compile(r"^exit_code:", re.M)
    for path in root.glob("*/terminals/*.txt"):
        try:
            text = path.read_text(errors="replace")
        except OSError:
            continue
        if ended_re.search(text) or exit_re.search(text):
            continue
        m = pid_re.search(text)
        if not m:
            continue
        pid = int(m.group(1))
        if is_running(pid):
            protect.add(pid)
    return protect


def descendants(rows: list[tuple[int, int, str, str]], root: int) -> list[int]:
    kids = [root]
    for pid, ppid, _, _ in rows:
        if ppid in kids and pid not in kids:
            kids.append(pid)
    return kids


def find_kill_roots(
    rows: list[tuple[int, int, str, str]],
    *,
    agent_max_age: int,
    interactive_max_age: int,
    orphan_max_age: int,
    grace_sec: int,
    protect: set[int],
    extension_hosts: set[int] | None,
    pty_host: int | None,
) -> list[tuple[int, str, str]]:
    ext_hosts = extension_hosts or set()
    if not ext_hosts:
        for pid, _, _, cmd in rows:
            if "extension-host" in cmd:
                ext_hosts.add(pid)

    pty = pty_host
    if pty is None:
        for pid, _, _, cmd in rows:
            if "terminal pty-host" in cmd:
                pty = pid
                break

    kill_roots: list[tuple[int, str, str]] = []

    for pid, ppid, etime, cmd in rows:
        if pid in protect:
            continue
        sec = etime_seconds(etime)
        if sec < grace_sec:
            continue

        if ppid in ext_hosts and AGENT_SHELL in cmd and sec >= agent_max_age:
            kill_roots.append((pid, etime, cmd[:120]))
            continue

        if pty is not None and ppid == pty and INTERACTIVE_SHELL in cmd:
            if pid in protect:
                continue
            if sec >= interactive_max_age:
                kill_roots.append((pid, etime, cmd[:120]))
            continue

        if ppid == 1 and any(p in cmd for p in ORPHAN_PATTERNS) and sec >= orphan_max_age:
            if cursor_linked(rows, pid) or "li-tests" in cmd or "lis db" in cmd:
                kill_roots.append((pid, etime, cmd[:120]))

    return kill_roots


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--agent-max-age-sec",
        type=int,
        default=int(os.environ.get("LI_CURSOR_TERMINALS_AGENT_MAX_AGE_SEC", "7200")),
    )
    parser.add_argument(
        "--interactive-max-age-sec",
        type=int,
        default=int(
            os.environ.get("LI_CURSOR_TERMINALS_INTERACTIVE_MAX_AGE_SEC", "14400")
        ),
    )
    parser.add_argument(
        "--orphan-max-age-sec",
        type=int,
        default=int(os.environ.get("LI_CURSOR_TERMINALS_ORPHAN_MAX_AGE_SEC", "14400")),
    )
    parser.add_argument(
        "--grace-sec",
        type=int,
        default=int(os.environ.get("LI_CURSOR_TERMINALS_GRACE_SEC", "120")),
    )
    parser.add_argument(
        "--kill-mode",
        choices=("term", "kill"),
        default=os.environ.get("LI_CURSOR_TERMINALS_KILL_MODE", "term"),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    protect = protect_from_terminal_logs()
    extra = os.environ.get("LI_CURSOR_TERMINALS_PROTECT_PIDS", "")
    for part in extra.split(","):
        part = part.strip()
        if part.isdigit():
            protect.add(int(part))
    protect.add(os.getpid())

    rows = load_ps()
    kill_roots = find_kill_roots(
        rows,
        agent_max_age=args.agent_max_age_sec,
        interactive_max_age=args.interactive_max_age_sec,
        orphan_max_age=args.orphan_max_age_sec,
        grace_sec=args.grace_sec,
        protect=protect,
        extension_hosts=None,
        pty_host=None,
    )

    kill_pids: set[int] = set()
    for root, _, _ in kill_roots:
        if root in protect:
            continue
        for pid in descendants(rows, root):
            if pid not in protect:
                kill_pids.add(pid)

    sig = signal.SIGKILL if args.kill_mode == "kill" else signal.SIGTERM

    if args.json:
        import json

        print(
            json.dumps(
                {
                    "dry_run": args.dry_run,
                    "protect": sorted(protect),
                    "roots": [
                        {"pid": r[0], "etime": r[1], "cmd": r[2]} for r in kill_roots
                    ],
                    "pids": sorted(kill_pids),
                },
                indent=2,
            )
        )
        return 0

    if not kill_roots:
        print("cleanup-stale-cursor-terminals: nothing stale")
        return 0

    print(
        f"cleanup-stale-cursor-terminals: {'would kill' if args.dry_run else 'killing'} "
        f"{len(kill_pids)} pid(s) in {len(kill_roots)} tree(s)"
    )
    for root, etime, cmd in kill_roots:
        print(f"  root {root} etime={etime} {cmd}")

    if args.dry_run:
        return 0

    for pid in sorted(kill_pids):
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            pass
        except PermissionError as e:
            print(f"WARN: cannot signal pid {pid}: {e}", file=sys.stderr)

    if args.kill_mode == "term":
        import time

        time.sleep(1)
        for pid in sorted(kill_pids):
            if is_running(pid):
                try:
                    os.kill(pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
