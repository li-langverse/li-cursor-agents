#!/usr/bin/env python3
"""Render swarm health markdown from probe JSON files (see swarm-health-report.sh)."""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RESEARCH_AGENT_IDS = frozenset(
    {
        "numerics_researcher",
        "goal_researcher",
        "gap_explorer",
        "autoresearch",
        "proof_gap_researcher",
        "stdlib_researcher",
    }
)
META_AGENT_IDS = ("swarm_observer", "ecosystem_grader")
STALE_CATEGORY = "stale_running_reconciled"
SUCCESS_STATUSES = frozenset({"finished", "completed"})


def load_json(path: str | None) -> dict[str, Any] | None:
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def esc_cell(s: str | None) -> str:
    if not s:
        return "—"
    return str(s).replace("|", "\\|").replace("\n", " ")[:120]


def parse_prev_report(path: str | None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "overall": None,
        "total_errors": None,
        "real_errors": None,
        "async_swarm": None,
    }
    if not path or not os.path.isfile(path):
        return out
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError:
        return out
    m = re.search(r"\*\*Overall:\*\*\s+(\*\*)?(OK|UNHEALTHY)", text)
    if m:
        out["overall"] = "OK" if m.group(2) == "OK" else "UNHEALTHY"
    m = re.search(r"\*\*Real errors:\*\*\s+\*\*(\d+)\*\*", text)
    if m:
        out["real_errors"] = int(m.group(1))
    else:
        m = re.search(r"Window:.*?\*\*(\d+)\*\*\s+error", text)
        if m:
            out["total_errors"] = int(m.group(1))
    m = re.search(r"async_swarm_running\s+\|\s+(true|false)", text)
    if m:
        out["async_swarm"] = m.group(1) == "true"
    return out


def error_split(errors: dict[str, Any] | None) -> tuple[int, int, int, list[dict[str, Any]]]:
    if not errors:
        return 0, 0, 0, []
    stale = int(errors.get("stale_reconcile_count") or 0)
    real = int(errors.get("real_error_count") or 0)
    total = int(errors.get("total_errors") or stale + real)
    if stale == 0 and real == 0:
        cats = errors.get("categories") or []
        for c in cats:
            n = int(c.get("count") or 0)
            if c.get("category") == STALE_CATEGORY:
                stale += n
            else:
                real += n
        if total == 0:
            total = stale + real
    real_cats = [c for c in (errors.get("categories") or []) if c.get("category") != STALE_CATEGORY]
    real_cats.sort(key=lambda c: (-int(c.get("count") or 0), c.get("category") or ""))
    return total, stale, real, real_cats[:3]


def research_productivity(research: dict[str, Any] | None, runs: dict[str, Any] | None) -> dict[str, Any]:
    runs_list = (research or {}).get("runs") or []
    finished = error = stale = 0
    with_goal = 0
    for r in runs_list[:10]:
        st = (r.get("status") or "").lower()
        cat = r.get("error_category") or r.get("error") or ""
        if st in SUCCESS_STATUSES:
            finished += 1
        elif st == "error":
            if STALE_CATEGORY in str(cat):
                stale += 1
            else:
                error += 1
        elif STALE_CATEGORY in str(cat):
            stale += 1
        if r.get("goal_id") or r.get("vertical"):
            with_goal += 1

    last_ok: dict[str, Any] | None = None
    for r in (runs or {}).get("runs") or []:
        aid = r.get("agent_id") or ""
        if aid not in RESEARCH_AGENT_IDS:
            continue
        if (r.get("status") or "").lower() not in SUCCESS_STATUSES:
            continue
        at = r.get("finished_at") or r.get("started_at") or ""
        if not last_ok or at > (last_ok.get("finished_at") or last_ok.get("started_at") or ""):
            last_ok = r

    last_ok_at = None
    if last_ok:
        last_ok_at = last_ok.get("finished_at") or last_ok.get("started_at")

    return {
        "finished": finished,
        "error": error,
        "stale": stale,
        "with_goal": with_goal,
        "last_ok": last_ok,
        "last_ok_at": last_ok_at,
    }


def meta_agent_status(runs: dict[str, Any] | None) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    all_runs = (runs or {}).get("runs") or []
    for agent in META_AGENT_IDS:
        latest = None
        for r in all_runs:
            if r.get("agent_id") != agent:
                continue
            at = r.get("finished_at") or r.get("started_at") or ""
            if latest is None or at > (latest.get("finished_at") or latest.get("started_at") or ""):
                latest = r
        if latest:
            out.append(
                {
                    "agent": agent,
                    "status": str(latest.get("status") or "—"),
                    "at": str(latest.get("finished_at") or latest.get("started_at") or "—"),
                }
            )
        else:
            out.append({"agent": agent, "status": "no recent run", "at": "—"})
    return out


def load_ecosystem_grade(root: str) -> dict[str, Any] | None:
    candidates = [
        os.environ.get("LI_BENCHMARKS_ROOT"),
        os.path.join(root, "..", "benchmarks"),
        os.path.join(root, "..", "..", "benchmarks"),
    ]
    for base in candidates:
        if not base:
            continue
        path = os.path.join(base, "data", "latest", "ecosystem-quality-report.json")
        data = load_json(path)
        if data and "grade" in data:
            data["_path"] = path
            return data
    return None


def interventions_nonempty(iv: dict[str, Any] | None, iv_path: str | None) -> tuple[bool, int]:
    items = (iv or {}).get("interventions") if iv else None
    if items is None and iv_path and os.path.isfile(iv_path):
        data = load_json(iv_path)
        items = (data or {}).get("interventions") if isinstance(data, dict) else data
    if isinstance(items, list):
        return len(items) > 0, len(items)
    return False, 0


def score_operational(
    exit_code: int,
    dash: str,
    async_svc: str,
    real_errors: int,
    async_running: bool | None,
) -> int:
    s = 10
    if exit_code != 0:
        s -= 4
    if dash != "active":
        s -= 3
    if async_svc != "active":
        s -= 2
    if async_running is False:
        s -= 3
    if real_errors > 10:
        s -= 3
    elif real_errors > 5:
        s -= 2
    elif real_errors > 0:
        s -= 1
    return max(1, min(10, s))


def score_self_healing(stale: int, real: int, async_running: bool | None) -> int:
    s = 8
    if async_running is False:
        s -= 4
    total = stale + real
    if total > 0 and stale / total > 0.9:
        s += 1  # mostly bookkeeping noise
    if real > 5:
        s -= 3
    elif real > 0:
        s -= 1
    return max(1, min(10, s))


def score_self_improvement(
    prod: dict[str, Any],
    eco: dict[str, Any] | None,
    meta: list[dict[str, str]],
    iv_count: int,
) -> int:
    s = 6
    if prod["finished"] >= 3:
        s += 2
    elif prod["finished"] >= 1:
        s += 1
    if prod["with_goal"] >= 5:
        s += 1
    if prod["last_ok_at"]:
        try:
            t = datetime.fromisoformat(str(prod["last_ok_at"]).replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - t).total_seconds() < 86400:
                s += 1
        except ValueError:
            pass
    if eco:
        g = str(eco.get("grade") or "")
        if g in ("A", "B"):
            s += 2
        elif g == "C":
            s += 1
        elif g in ("D", "F"):
            s -= 1
    for m in meta:
        if m["status"] in SUCCESS_STATUSES:
            s += 1
    if iv_count > 0:
        s -= 2
    return max(1, min(10, s))


def recommendations(
    real_errors: int,
    async_running: bool | None,
    prod: dict[str, Any],
    exit_code: int,
    stale: int,
    runtime_ok: bool,
    dash: str,
    async_svc: str,
) -> list[str]:
    rec: list[str] = []
    if not runtime_ok:
        if dash == "active" and async_svc == "active":
            rec.append(
                "`GET /api/runtime` timed out while both systemd units are active — inspect dashboard API latency, `worker_status.active_runs` payload size, and Supabase/heartbeat logs."
            )
        elif dash != "active":
            rec.append("Dashboard service is not active — restart/check `li-agents-dashboard.service` before trusting API rows.")
    if real_errors > 5:
        rec.append(
            f"**{real_errors} real errors** in 24h — inspect top categories and recent-error-learnings; stale reconcile ({stale}) is informational only."
        )
    if async_running is False:
        rec.append(
            "**async_swarm_running is false** — check `li-agents-async-swarm.service` and dashboard logs; research lane will not progress."
        )
    last_at = prod.get("last_ok_at")
    stale_research = False
    if last_at:
        try:
            t = datetime.fromisoformat(str(last_at).replace("Z", "+00:00"))
            stale_research = (datetime.now(timezone.utc) - t).total_seconds() > 86400
        except ValueError:
            stale_research = True
    else:
        stale_research = True
    if stale_research and prod.get("finished", 0) == 0:
        rec.append(
            "No **successful researcher run** in the last 24h — verify goal queue, SDK slots, and `GET /api/research/runs`."
        )
    elif stale_research:
        rec.append("Last successful researcher run is **older than 24h** — consider nudging research lane or checking slot contention.")
    api_timeout_with_active_units = not runtime_ok and dash == "active" and async_svc == "active"
    if exit_code != 0 and len(rec) < 3 and not api_timeout_with_active_units:
        rec.append("Overall **UNHEALTHY** — fix dashboard/async-swarm before trusting Researchers tab status rows.")
    return rec[:3]


def trend_line(
    prev: dict[str, Any],
    overall: str,
    total: int,
    real: int,
    async_running: bool | None,
) -> list[str]:
    lines: list[str] = []
    if prev.get("overall") is None:
        lines.append("_No prior snapshot in report directory — trend available after the next run._")
        return lines
    po, pn = prev.get("overall"), overall.replace("**", "").strip()
    if po != pn:
        lines.append(f"- Overall: **{po}** → **{pn}**")
    else:
        lines.append(f"- Overall: unchanged (**{pn}**)")
    if prev.get("real_errors") is not None:
        delta = real - int(prev["real_errors"])
        sign = "+" if delta > 0 else ""
        lines.append(f"- Real errors (1d): {prev['real_errors']} → {real} ({sign}{delta})")
    elif prev.get("total_errors") is not None:
        delta = total - int(prev["total_errors"])
        sign = "+" if delta > 0 else ""
        lines.append(f"- Total errors (1d): {prev['total_errors']} → {total} ({sign}{delta})")
    pa = prev.get("async_swarm")
    if pa is not None and async_running is not None:
        if pa and not async_running:
            lines.append("- async_swarm: was **up**, now **down** ⚠")
        elif not pa and async_running:
            lines.append("- async_swarm: was **down**, now **up**")
        else:
            lines.append(f"- async_swarm: {'up' if async_running else 'down'} (unchanged)")
    return lines


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: swarm-health-report-render.py <context.json>", file=sys.stderr)
        return 2
    ctx = load_json(sys.argv[1])
    if not ctx:
        print("invalid context", file=sys.stderr)
        return 2

    root = ctx["root"]
    exit_code = int(ctx["exit_code"])
    overall = "OK" if exit_code == 0 else "**UNHEALTHY**"
    dash = ctx["dash_status"]
    async_svc = ctx["async_status"]
    runtime = load_json(ctx.get("runtime_file"))
    research = load_json(ctx.get("research_file"))
    errors = load_json(ctx.get("errors_file"))
    runs = load_json(ctx.get("runs_file"))
    handoffs = load_json(ctx.get("handoffs_file"))
    iv = load_json(ctx.get("interventions_file"))

    runtime_ok = runtime is not None
    research_ok = research is not None
    errors_ok = errors is not None
    runs_ok = runs is not None

    async_running: bool | None = None
    if runtime_ok:
        v = runtime.get("async_swarm_running")
        async_running = v is True or v == "true"

    prev = parse_prev_report(ctx.get("prev_report_file"))
    total_e, stale_e, real_e, top_real = error_split(errors if errors_ok else None)
    prod = research_productivity(research if research_ok else None, runs if runs_ok else None)
    eco = load_ecosystem_grade(root)
    iv_nonempty, iv_count = interventions_nonempty(iv, ctx.get("interventions_path"))
    meta = meta_agent_status(runs if runs_ok else None)
    handoff_count = int((handoffs or {}).get("count") or len((handoffs or {}).get("handoffs") or []))

    op = score_operational(exit_code, dash, async_svc, real_e, async_running)
    heal = score_self_healing(stale_e, real_e, async_running)
    improve = score_self_improvement(prod, eco, meta, iv_count)
    recs = recommendations(real_e, async_running, prod, exit_code, stale_e, runtime_ok, dash, async_svc)

    print("# Swarm health report")
    print()
    print(f"- **Generated (UTC):** {ctx['generated_utc']}")
    print(f"- **Host:** {ctx.get('hostname', 'unknown')}")
    print(f"- **Repo:** `{root}`")
    print(f"- **Dashboard:** {ctx['base_url']}")
    print(f"- **Overall:** {overall}")
    if ctx.get("dry_run"):
        print("- **Mode:** dry-run (mocked probes)")
    print()

    print("## Trend (vs previous snapshot)")
    print()
    for line in trend_line(prev, overall, total_e, real_e, async_running):
        print(line)
    if ctx.get("prev_report_file"):
        print(f"- Prior file: `{os.path.basename(ctx['prev_report_file'])}`")
    print()

    print("## Scores (1–10, heuristic)")
    print()
    print("| Dimension | Score |")
    print("|-----------|-------|")
    print(f"| Operational | {op}/10 |")
    print(f"| Self-healing | {heal}/10 |")
    print(f"| Self-improvement | {improve}/10 |")
    print()
    print(
        "_Rules: operational penalizes dashboard/async down and real errors; "
        "self-healing weights async_swarm and real vs stale noise; "
        "self-improvement rewards recent finished research, goal/vertical linkage, ecosystem grade, meta-agent success. "
        "See `docs/ecosystem/swarm-health-monitoring.md`._"
    )
    print()

    print("## Recommendations")
    print()
    if recs:
        for r in recs:
            print(f"- {r}")
    else:
        print("_No automatic alerts — thresholds for real errors, async swarm, and research staleness are clear._")
    print()

    print("## systemd (user)")
    print()
    print("| Unit | State |")
    print("|------|-------|")
    print(f"| `li-agents-dashboard.service` | {dash} |")
    print(f"| `li-agents-async-swarm.service` | {async_svc} |")
    print()

    env_file = ctx.get("env_file") or "—"
    gh_present = ctx.get("gh_token_present") or "unknown"
    print("## GitHub credentials")
    print()
    print("| Field | Value |")
    print("|-------|-------|")
    print(f"| env_file | `{env_file}` |")
    print(f"| GH_TOKEN present | {gh_present} |")
    print()

    print("## Runtime API")
    print()
    if not runtime_ok:
        print("Dashboard **unreachable** (`GET /api/runtime`).")
    else:
        print("| Field | Value |")
        print("|-------|-------|")
        for key in (
            "store",
            "db_enabled",
            "async_swarm_running",
            "active_run_count",
            "sdk_slots_in_use",
            "sdk_max_concurrent",
            "active_runs_registered",
        ):
            val = runtime.get(key, "—")
            if isinstance(val, bool):
                val = "true" if val else "false"
            print(f"| {key} | {val} |")
    print()

    print("## Research productivity (last 10)")
    print()
    if not research_ok:
        print("_Could not fetch `GET /api/research/runs?limit=10`._")
    else:
        print(
            f"- **finished:** {prod['finished']} · **error:** {prod['error']} · "
            f"**stale (reconciled):** {prod['stale']} · **with vertical/goal:** {prod['with_goal']}/10"
        )
        if prod["last_ok"]:
            r = prod["last_ok"]
            print(
                f"- Last successful researcher: `{r.get('agent_id')}` @ "
                f"{prod['last_ok_at']} (`{r.get('run_id', '—')}`)"
            )
        else:
            print("- Last successful researcher: _none in recent `GET /api/runs`_")
        print()
        print("_Researchers tab lists all research-lane rows; stale rows after restart are bookkeeping, not task failures._")
        print()
        print("| status | vertical | goal | agent | summary |")
        print("|--------|----------|------|-------|---------|")
        for r in (research.get("runs") or [])[:10]:
            print(
                f"| {esc_cell(r.get('status'))} | {esc_cell(r.get('vertical') or r.get('vertical_label'))} "
                f"| {esc_cell(r.get('goal_title') or r.get('goal_id'))} | {esc_cell(r.get('agent_id'))} "
                f"| {esc_cell(r.get('summary'))} |"
            )
    print()

    print("## Errors (1d, deduped)")
    print()
    if not errors_ok:
        print("_Could not fetch `GET /api/errors/summary?range=1d`._")
    else:
        label = errors.get("label") or errors.get("range_preset") or "1d"
        print(f"Window: **{label}**")
        print(f"- **Stale reconcile** (informational): **{stale_e}**")
        print(f"- **Real errors** (actionable): **{real_e}**")
        print(f"- Total rows in summary: **{total_e}**")
        if top_real:
            print()
            print("Top real error categories:")
            print()
            print("| category | count |")
            print("|----------|-------|")
            for c in top_real:
                print(f"| {esc_cell(c.get('category'))} | {c.get('count', 0)} |")
        elif real_e == 0:
            print()
            print("_No actionable error categories in window._")
    print()

    print("## Self-improvement signals")
    print()
    if eco:
        print(
            f"- Ecosystem quality: **{eco.get('grade', '—')}** "
            f"(score {eco.get('overall_score', '—')}, unattended_safe={eco.get('unattended_safe', '—')})"
        )
    else:
        print("- Ecosystem quality: _ecosystem-quality-report.json not found_")
    print(f"- Open handoffs: **{handoff_count}**")
    print(f"- Interventions pending: **{'yes' if iv_nonempty else 'no'}** ({iv_count})")
    print("- Meta agents (latest run):")
    for m in meta:
        print(f"  - `{m['agent']}`: {m['status']} @ {m['at']}")
    print()

    print("## Optional: legacy researchers loop")
    print()
    print(
        f"- `run-researchers-long` processes: **{ctx.get('long_pgrep', 0)}** "
        "(prefer `li-agents-async-swarm` + research lane)"
    )
    print()
    print("---")
    print()
    print(f"Regenerate: `{root}/scripts/swarm-health-report.sh`")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
