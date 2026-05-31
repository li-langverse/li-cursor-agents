# Org supervisor dashboard

Local explorer for the three **li-swarm** org supervisors:

| Column | K8s deployment | Coordination |
|--------|----------------|--------------|
| Issue implementer | `li-org-issue-supervisor` | `org-issue-active.json` |
| PR implementer | `li-org-pr-supervisor` | `org-pr-active.json` (implementer role) |
| PR reviewer | `li-org-reviewer-supervisor` | `org-pr-active.json` (reviewer role) |

## Quick start (Windows)

From `li-cursor-agents` root (after copying `.env.example` → `.env` with Supabase vars if available):

```powershell
npm run dashboard:org-supervisors
```

Open **http://127.0.0.1:5174** (Vite dev UI; API on port **9478**).

Mock mode (no Supabase / no sprint files):

```powershell
$env:LI_ORG_SUPERVISOR_DASHBOARD_MOCK = "1"
npm run dashboard:org-supervisors
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | API + Vite (same as root `dashboard:org-supervisors`) |
| `npm run dev:api` | API only |
| `npm run dev:ui` | Vite only (proxies `/api` → 9478) |
| `npm run build` | Production static bundle → `dist/` |
| `npm run start` | API + serve built `dist/` |

## Data sources (priority)

1. **Supabase** — `org_supervisor_cycles` when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set in repo `.env`
2. **Files** — `data/goal-directed-sprints/*.json` + audit JSONL tails; optional `org-*-open-count.py` when `GH_TOKEN` is set
3. **Mock** — `LI_ORG_SUPERVISOR_DASHBOARD_MOCK=1`

Homelab supervisors write cycle rows when cluster ConfigMaps include Supabase env. Local dev without cluster uses file fallback from the sprint PVC mirror under `data/goal-directed-sprints/`.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `ORG_SUPERVISOR_DASHBOARD_API_PORT` | `9478` | API listen port |
| `ORG_SUPERVISOR_DASHBOARD_UI_PORT` | `5174` | Vite dev port |
| `ORG_SUPERVISOR_DASHBOARD_HOST` | `127.0.0.1` | API bind address |
| `LI_ORG_SUPERVISOR_DASHBOARD_MOCK` | — | `1` = fixture data |
| `LI_AGENTS_ROOT` | repo root | Override agents package path |
| `SUPABASE_URL` | from `.env` | Primary data source |
| `SUPABASE_SERVICE_ROLE_KEY` | from `.env` | Supabase read |
| `GH_TOKEN` | from `.env` | Optional live open counts |
| `KUBECONFIG` | — | Shown in kubectl hint chips only |

See also [docs/ecosystem/org-supervisor-dashboard.md](../../docs/ecosystem/org-supervisor-dashboard.md).
