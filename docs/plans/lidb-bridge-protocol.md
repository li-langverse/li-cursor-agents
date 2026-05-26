# lidb-liorm bridge protocol (WP-J)

**Version:** `1` (field `protocol_version` on probe and mutating commands)  
**Implementation:** `scripts/lidb-liorm-bridge.py`  
**Consumer:** `src/db/lidb-liorm.ts`

Breaking changes to stdout JSON shape require incrementing `protocol_version` and updating this doc.

## Invocation

```bash
python3 scripts/lidb-liorm-bridge.py <command> [args...]
```

Environment: `LI_LIDB_REPO`, `LIDB_DATA_DIR` / `LI_DATA_DIR`, optional `LIDB_EMBED`.

## Responses

All commands print **one JSON object** on stdout (last line). Exit `0` when `ok: true`.

### `probe`

```json
{"ok": true, "engine": true, "protocol_version": 1}
```

### `read_liq`

Input: liq source string, e.g. `read agent_runs limit 20`

```json
{"ok": true, "rows": [{"id": "…", "status": "running"}], "row_count": 1}
```

### `exec_sql`

Input: SQL with `?` placeholders, JSON array of params.

```json
{"ok": true, "rows": [...], "row_count": N}
```

### `upsert_agent_run`

Input: JSON object with at least `run_id`, `agent_id`, `status`, `started_at`. Optional: `finished_at`, `backend`, `briefing_hash`, `reason`, `fingerprint`, `coordinator`, `duration_ms`, `output_md`.

```json
{"ok": true, "run_id": "agent-123", "protocol_version": 1}
```

### `upsert_control_plane_state`

Input: full control-plane state JSON (mirrors `state.json` + `updated_at`).

Singleton upsert: `DELETE FROM control_plane_state WHERE id = 1` then `INSERT`.

```json
{"ok": true, "protocol_version": 1}
```

## Errors

```json
{"ok": false, "error": "human-readable message"}
```

## Single-writer semantics

One process should own writes to a given `LI_DATA_DIR` / `LIDB_DATA_DIR`. Agents must not run concurrent bridge mutators against the same heap (lis supervisor is the intended writer host).

## Raw SQL policy

Agent-facing profiles must use **liq** (`read_liq`) or bridge upsert commands — not arbitrary mutating `exec_sql` from untrusted prompts.
