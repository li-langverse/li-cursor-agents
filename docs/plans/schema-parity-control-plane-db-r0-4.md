# DB-R0-4: Control-plane schema parity (Supabase vs lidb)

**Status:** Updated WP-J (2026-05-26)  
**Supabase source:** `supabase/migrations/20260517120000_control_plane.sql` (+ follow-ons)  
**lidb catalog:** `lidb/liorm/catalog.py` + native embed bootstrap (`engine/native_catalog.cpp`)  
**Postgres migration:** `lidb/migrations/003_control_plane.sql`

## Summary

| Area | Supabase | lidb native (2026-05-26 WP-J) | liorm persist in li-cursor-agents |
|------|----------|-------------------------------|-----------------------------------|
| `agent_runs` | Full row (jsonb completion, trace, …) | Expanded catalog columns; native heap schemaless | **Yes** — `upsert_agent_run` bridge (subset + UPDATE) |
| `agent_run_events` | Yes | Catalog only | **No** — not in embed bootstrap |
| `control_plane_state` | Yes | **Native bootstrap + DELETE/INSERT upsert** | **Yes** — engine e2e passes |
| `control_plane_reports` | Yes | Catalog only | **No** — reports e2e todo (table not in bootstrap) |
| `interventions_snapshots` | Yes | Catalog only | **No** |
| `briefing_snapshots` | Yes | Catalog only | **No** |
| `heap_plan_snapshots` | Yes | Catalog only | **No** |
| `queued_agent_tasks` | Yes | Catalog only | **No** |
| `repo_workflow_rollouts` | Yes | Catalog only | **No** |
| `agent_handoffs` | `20260517151000_swarm_handoffs_sessions.sql` | **Not in catalog** | **Blocked** |

## Column gaps (`agent_runs`)

| Supabase column | lidb catalog / embed (WP-J) |
|-----------------|------------------------------|
| `run_id` (PK) | `run_id`, `id` |
| `output_md`, `completion`, `pr_urls`, `meta`, `run_trace` | Catalog allows `output_md`, `completion`, `pr_urls`, `meta`; bridge writes `output_md` only; `run_trace` **deferred** |
| `backend`, `reason`, `fingerprint`, `coordinator` | **In catalog + bridge** |
| `finished_at` | `finished_at`, `completed_at` (both in catalog) |
| `duration_ms`, `output_path`, `error`, `deliverables` | **In catalog**; bridge does not set all yet |

## Next unblocks

1. **lidb** — bootstrap remaining allowlist tables (`control_plane_reports`, snapshots, …) in native migrate.
2. **li-cursor-agents** — extend bridge with report/intervention upserts once tables exist.
3. **PH-DB-4** — align registry + control-plane central DB before default store flip.

## Bridge protocol

See [lidb-bridge-protocol.md](./lidb-bridge-protocol.md) (WP-J): stdout JSON, `protocol_version: 1`.
