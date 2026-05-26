---
name: explore-control-plane-db
description: >-
  Read-only SQL and schema exploration of the li-cursor-agents control-plane
  Postgres (Supabase). Use when analyzing agent runs, supervisor state, briefing
  snapshots, interventions, or heap queue data stored in the dashboard database.
---

# Explore control-plane database

## When to use

- Inspect **agent run history**, failures, PR URLs, completion JSON
- Compare **briefing_hash** across `agent_runs`, `briefing_snapshots`, `queued_agent_tasks`
- Debug supervisor: `control_plane_state`, latest `control_plane_reports`
- Audit interventions or repo workflow rollouts

## Tools

### Supabase store (`LI_CONTROL_PLANE_STORE=supabase`) — MCP `li-control-plane-db`

| Tool | Purpose |
|------|---------|
| `list_control_plane_tables` | Tables + key columns |
| `describe_table` | `information_schema` columns for one table |
| `query_control_plane_db` | Run read-only SQL (max 200 rows) |

### lidb store (`LI_CONTROL_PLANE_STORE=lidb`) — MCP `li-control-plane-liq`

| Tool | Purpose |
|------|---------|
| `schema_snapshot` | Catalog tables (same names as Supabase migrations) |
| `describe_table_liq` | Allowlisted columns for one table |
| `query_control_plane_liq` | `read <table> limit N` via liorm (e.g. `read agent_runs limit 20`) |

Enable: `LI_CONTROL_PLANE_LIQ_MCP=1`. Harness mock rows: `LI_LIDB_MOCK=1`. Real engine: `LI_LIDB_URL` or `LI_DATA_DIR` + built `lidb_embed`.

## Rules

- **Read-only only** — `SELECT`, `WITH`, `EXPLAIN`. No `INSERT`/`UPDATE`/`DELETE`.
- Query **`public`** tables listed in the skill (no auth.users, no secrets).
- Prefer narrow columns; use `LIMIT` for large tables (`agent_runs.output_md` is huge).
- Embeddings / vector search: **not available** in v1 — use SQL filters on `jsonb` (`completion`, `payload`).

## Example queries

```sql
SELECT run_id, agent_id, status, started_at, briefing_hash
FROM agent_runs
ORDER BY started_at DESC
LIMIT 20;

SELECT agent_id, status, count(*) AS n
FROM agent_runs
GROUP BY agent_id, status
ORDER BY n DESC;

SELECT briefing_hash, generated_at, is_latest
FROM control_plane_reports
ORDER BY generated_at DESC
LIMIT 5;
```

## Local setup

Requires `npm run db:ensure` and `LI_CONTROL_PLANE_STORE=supabase`. Disable MCP: `LI_CONTROL_PLANE_DB_MCP=0`.

Manual probe: `npm run db:probe`
