#!/usr/bin/env python3
"""
PH-DB-10: Node ↔ lidb liorm/liq bridge (subprocess).

Commands (JSON on stdout):
  probe              → {"ok": bool, "engine": bool}
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

    return {"ok": True, "engine": probe_engine_ready()}


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

    from liorm.embed_engine import execute_sql

    # Native embed: DELETE not supported yet — upsert via id replace (read-then-skip if present).
    existing = execute_sql(
        "SELECT id FROM agent_runs WHERE id = ? OR run_id = ? LIMIT 1",
        [run_id, run_id],
    )
    if not existing:
        execute_sql(
            "INSERT INTO agent_runs (id, run_id, agent_id, status, started_at) VALUES (?, ?, ?, ?, ?)",
            [run_id, run_id, agent_id, status, started_at],
        )
    return {"ok": True, "run_id": run_id}


def cmd_upsert_control_plane_state(payload_json: str) -> dict[str, Any]:
    import json as json_mod

    state = json_mod.loads(payload_json)
    from liorm.embed_engine import execute_sql

    payload = json_mod.dumps(state)
    updated_at = state.get("updated_at") or ""
    execute_sql("DELETE FROM control_plane_state WHERE id = ?", [1])
    try:
        execute_sql(
            "INSERT INTO control_plane_state (id, payload, updated_at) VALUES (?, ?, ?)",
            [1, payload, updated_at],
        )
    except RuntimeError:
        # Table may be absent until control-plane migration lands on native catalog.
        return {"ok": False, "error": "control_plane_state table not available in lidb catalog"}
    return {"ok": True}


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
