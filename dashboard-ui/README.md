# Agent swarm dashboard (Next.js)

Next.js **16.2.6** (May 2026 security release) UI for the li-cursor-agents control plane. `/api/*` is proxied to the existing Node server on port **9477**.

## Dev (two terminals)

```bash
# Terminal 1 — API
cd li-cursor-agents
export LI_CONTROL_PLANE_STORE=supabase   # or disk
npm run build && npm run dashboard

# Terminal 2 — UI
npm run dashboard:ui
# http://localhost:3000
```

Or one command (starts API in background):

```bash
npm run dashboard:dev
```

## Production UI only

```bash
cd dashboard-ui && npm run build && npm run start
```

Set `LI_AGENT_API_URL` if the API is not on `http://127.0.0.1:9477`.

The legacy static UI under `web/` remains for now; this app is the preferred dashboard.
