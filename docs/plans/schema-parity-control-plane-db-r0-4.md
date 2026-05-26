# DB-R0-4: Control-plane schema parity (Supabase vs lidb)

**Status:** Gap table (WP-E / PH-DB-10)  
**Supabase source:** `supabase/migrations/20260517120000_control_plane.sql` (+ follow-ons)  
**lidb catalog:** `lidb/liorm/catalog.py` + native embed bootstrap (`engine/native_catalog.cpp`)

## Summary

| Area | Supabase | lidb native (2026-05-26) | liorm persist in li-cursor-agents |
|------|----------|-------------------------|-----------------------------------|
| `agent_runs` | Full row (jsonb completion, trace, …) | Subset columns (`id`, `run_id`, `agent_id`, `status`, …) | **Yes** — `upsert_agent_run` bridge |
| `agent_run_events` | Yes | Catalog only | **No** — not in embed bootstrap |
| `control_plane_state` | Yes | Catalog only | **Partial** — fails until table in native migrate |
| `control_plane_reports` | Yes | Catalog only | **No** — reports/handoffs e2e todo |
| `interventions_snapshots` | Yes | Catalog only | **No** |
| `briefing_snapshots` | Yes | Catalog only | **No** |
| `heap_plan_snapshots` | Yes | Catalog only | **No** |
| `queued_agent_tasks` | Yes | Catalog only | **No** |
| `repo_workflow_rollouts` | Yes | Catalog only | **No** |
| `agent_handoffs` | `20260517151000_swarm_handoffs_sessions.sql` | **Not in catalog** | **Blocked** |

## Column gaps (`agent_runs`)

| Supabase column | lidb catalog / embed |
|-----------------|----------------------|
| `run_id` (PK) | `run_id`, `id` |
| `output_md`, `completion`, `pr_urls`, `meta`, `run_trace` | Mapped to `output` text only (truncated) |
| `backend`, `reason`, `fingerprint`, `coordinator` | **Missing** |
| `finished_at` | `completed_at` |

## Next unblocks

1. **lidb** — apply control-plane DDL to native migrations (not only `migrations/archive/002_control_plane_embedded.sql`).
2. **li-cursor-agents** — extend bridge with report/intervention upserts once tables exist.
3. **PH-DB-4** — align registry + control-plane central DB before default store flip.
