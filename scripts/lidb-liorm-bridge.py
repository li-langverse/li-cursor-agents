#!/usr/bin/env python3
"""
PH-DB-10 / WP-J: Node ↔ lidb liorm/liq bridge (subprocess).

Protocol version: 1 (semver bump required for breaking stdout JSON shape).

Commands (JSON on stdout):
  probe              → {"ok": bool, "engine": bool, "protocol_version": 1}
  read_liq <liq>     → {"ok": true, "rows": [...], "row_count": N}
  exec_sql <sql> <params_json>
  upsert_agent_run <payload_json>
  upsert_control_plane_state <payload_json>
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

BRIDGE_PROTOCOL_VERSION = 1


def _repo_root() -> Path:
    override = os.environ.get("LI_LIDB_REPO", "").strip()
    if override:
        return Path(override)
    return Path(__file__).resolve().parent.parent.parent / "lidb"


def _setup_path() -> None:
    root = _repo_root()
    if not root.is_dir():
        raise RuntimeError(f"lidb repo not found: {root} (set LI_LIDB_REPO)")
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))


def _data_dir() -> Path | None:
    for key in ("LIDB_DATA_DIR", "LI_DATA_DIR"):
        raw = os.environ.get(key, "").strip()
        if raw:
            return Path(raw)
    url = os.environ.get("LI_LIDB_URL", "").strip()
    if url.startswith("file:"):
        return Path(url[5:].lstrip("/"))
    return None


def _apply_data_dir() -> None:
    data = _data_dir()
    if data is not None:
        os.environ["LIDB_DATA_DIR"] = str(data)


def cmd_probe() -> dict[str, Any]:
    from liorm.embed_engine import probe_engine_ready

    return {
        "ok": True,
        "engine": probe_engine_ready(),
        "protocol_version": BRIDGE_PROTOCOL_VERSION,
    }


def cmd_read_liq(liq: str) -> dict[str, Any]:
    from liq.compiler import compile
    from liorm.execute import clear_plans, execute, register_plan

    clear_plans()
    plan = compile(liq)
    pid = register_plan(
        "bridge.read",
        plan_id=plan.plan_id,
        ir=plan.ir,
        sql=plan.sql,
        param_schema=plan.param_schema,
    )
    result = execute(pid, {})
    return {"ok": True, "rows": result.rows, "row_count": len(result.rows)}


def cmd_exec_sql(sql: str, params_json: str) -> dict[str, Any]:
    from liorm.embed_engine import execute_sql

    params = json.loads(params_json) if params_json else []
    rows = execute_sql(sql, params)
    return {"ok": True, "rows": rows, "row_count": len(rows)}


def cmd_upsert_agent_run(payload_json: str) -> dict[str, Any]:
    row = json.loads(payload_json)
    run_id = str(row["run_id"])
    agent_id = str(row.get("agent_id") or "unknown")
    status = str(row.get("status") or "finished")
    started_at = str(row.get("started_at") or "")
    finished_at = str(row.get("finished_at") or "")
    backend = row.get("backend")
    briefing_hash = row.get("briefing_hash")
    reason = row.get("reason")
    fingerprint = row.get("fingerprint")
    coordinator = row.get("coordinator")
    duration_ms = row.get("duration_ms")
    output_md = row.get("output_md")

    from liorm.embed_engine import execute_sql

    existing = execute_sql(
        "SELECT id FROM agent_runs WHERE id = ? OR run_id = ? LIMIT 1",
        [run_id, run_id],
    )
    if existing:
        sets: list[str] = ["status = ?"]
        params: list[Any] = [status]
        if finished_at:
            sets.extend(["finished_at = ?", "completed_at = ?"])
            params.extend([finished_at, finished_at])
        if backend is not None:
            sets.append("backend = ?")
            params.append(str(backend))
        if briefing_hash is not None:
            sets.append("briefing_hash = ?")
            params.append(str(briefing_hash))
        if reason is not None:
            sets.append("reason = ?")
            params.append(str(reason))
        if fingerprint is not None:
            sets.append("fingerprint = ?")
            params.append(str(fingerprint))
        if coordinator is not None:
            sets.append("coordinator = ?")
            params.append(str(coordinator))
        if duration_ms is not None:
            sets.append("duration_ms = ?")
            params.append(str(duration_ms))
        if output_md is not None:
            sets.append("output_md = ?")
            params.append(str(output_md)[:8000])
        params.append(run_id)
        execute_sql(
            f"UPDATE agent_runs SET {', '.join(sets)} WHERE id = ?",
            params,
        )
    else:
        cols = ["id", "run_id", "agent_id", "status", "started_at"]
        vals: list[Any] = [run_id, run_id, agent_id, status, started_at]
        if finished_at:
            cols.extend(["finished_at", "completed_at"])
            vals.extend([finished_at, finished_at])
        if backend is not None:
            cols.append("backend")
            vals.append(str(backend))
        if briefing_hash is not None:
            cols.append("briefing_hash")
            vals.append(str(briefing_hash))
        if reason is not None:
            cols.append("reason")
            vals.append(str(reason))
        if fingerprint is not None:
            cols.append("fingerprint")
            vals.append(str(fingerprint))
        if coordinator is not None:
            cols.append("coordinator")
            vals.append(str(coordinator))
        if duration_ms is not None:
            cols.append("duration_ms")
            vals.append(str(duration_ms))
        if output_md is not None:
            cols.append("output_md")
            vals.append(str(output_md)[:8000])
        placeholders = ", ".join("?" for _ in cols)
        execute_sql(
            f"INSERT INTO agent_runs ({', '.join(cols)}) VALUES ({placeholders})",
            vals,
        )
    return {"ok": True, "run_id": run_id, "protocol_version": BRIDGE_PROTOCOL_VERSION}


def cmd_upsert_control_plane_state(payload_json: str) -> dict[str, Any]:
    import json as json_mod

    state = json_mod.loads(payload_json)
    from liorm.embed_engine import execute_sql

    payload = json_mod.dumps(state)
    updated_at = state.get("updated_at") or ""
    execute_sql("DELETE FROM control_plane_state WHERE id = ?", [1])
    execute_sql(
        "INSERT INTO control_plane_state (id, payload, updated_at) VALUES (?, ?, ?)",
        [1, payload, updated_at],
    )
    return {"ok": True, "protocol_version": BRIDGE_PROTOCOL_VERSION}


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "usage: lidb-liorm-bridge.py <command> [args]"}))
        return 2
    _setup_path()
    _apply_data_dir()
    cmd = sys.argv[1]
    try:
        if cmd == "probe":
            out = cmd_probe()
        elif cmd == "read_liq":
            if len(sys.argv) < 3:
                raise ValueError("read_liq requires liq string")
            out = cmd_read_liq(sys.argv[2])
        elif cmd == "exec_sql":
            if len(sys.argv) < 3:
                raise ValueError("exec_sql requires sql")
            params = sys.argv[3] if len(sys.argv) > 3 else "[]"
            out = cmd_exec_sql(sys.argv[2], params)
        elif cmd == "upsert_agent_run":
            if len(sys.argv) < 3:
                raise ValueError("upsert_agent_run requires json payload")
            out = cmd_upsert_agent_run(sys.argv[2])
        elif cmd == "upsert_control_plane_state":
            if len(sys.argv) < 3:
                raise ValueError("upsert_control_plane_state requires json payload")
            out = cmd_upsert_control_plane_state(sys.argv[2])
        else:
            out = {"ok": False, "error": f"unknown command: {cmd}"}
    except Exception as exc:  # noqa: BLE001 — bridge must return JSON errors to Node
        out = {"ok": False, "error": str(exc)}
    print(json.dumps(out))
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
