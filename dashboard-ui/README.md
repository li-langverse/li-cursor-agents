# Agent swarm dashboard (Next.js)

Next.js **16.2.6** UI for the li-cursor-agents control plane.

## Architecture

| Layer | Role |
|-------|------|
| **Next.js `:3000`** | UI + **native `GET /api/*`** (Supabase via `dist/dashboard-api`) |
| **ops-server `:9477`** | Agent spawn, lanes, supervisor, briefing refresh (`POST`/`PATCH`) |

Run `npm run build` at repo root before `dashboard-ui` dev/build so `dist/dashboard-api` exists.

## Dev (one command)

```bash
npm run db:ensure   # apply migrations (lane_state, runtime_settings, briefing is_latest, …)
npm run dev:all
```

## Environment

- Root `.env` / `.env.supabase` — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LI_CONTROL_PLANE_STORE=supabase`
- `LI_AGENT_API_URL` — ops-server for mutations (default `http://127.0.0.1:9477`)
- Optional `NEXT_PUBLIC_LI_AGENT_API_URL` — browser direct to ops (rare)

Disk-only dev: `LI_STACK_SKIP_SUPABASE=1 npm run dev:all`
