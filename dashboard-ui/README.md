# Agent swarm dashboard (Next.js)

Next.js **16.2.6** (May 2026 security release) UI for the li-cursor-agents control plane. `/api/*` is proxied to the existing Node server on port **9477**.

## Dev (one command)

From repo root:

```bash
npm run dev:all
```

Starts Supabase (when Docker is available), builds TypeScript, control-plane API on **:9477** with **async swarm running**, verifies all core `/api/*` routes (including `agent_handoffs`), then Next.js on **:3000** (`/api` proxied to the API).

Disk-only (no Docker): `LI_STACK_SKIP_SUPABASE=1 npm run dev:all`

## Dev (two terminals)

```bash
npm run build && npm run dashboard    # :9477
npm run dashboard:ui                  # :3000
```

## Production UI only

```bash
cd dashboard-ui && npm run build && npm run start
```

Set `LI_AGENT_API_URL` if the API is not on `http://127.0.0.1:9477`.

The legacy static UI under `web/` remains for now; this app is the preferred dashboard.
