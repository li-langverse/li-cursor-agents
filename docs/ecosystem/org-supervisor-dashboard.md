# Org supervisor dashboard

Local web UI to explore the three Kubernetes org supervisors on **li-swarm** (issue implementer, PR implementer, PR reviewer).

Related:

- [org-issue-supervisor-k8s.md](./org-issue-supervisor-k8s.md)
- [org-pr-reviewer-supervisor-k8s.md](./org-pr-reviewer-supervisor-k8s.md)
- Supabase table: `org_supervisor_cycles` (`supabase/migrations/20260531120000_org_supervisor_cycles.sql`)

## What you see

Three columns (tabs on narrow screens), each showing:

- Health (healthy / degraded / idle / unknown)
- Open count and desired worker slots
- Active claims from `active_claims` (DB) or PVC JSON
- Recent implementer/reviewer jobs from audit JSONL
- Copy-ready `kubectl logs` / `kubectl get jobs` hints

Optional **auto-refresh every 30s**.

## Run locally (Windows)

```powershell
cd li-cursor-agents
npm install
npm --prefix apps/org-supervisor-dashboard install
npm run dashboard:org-supervisors
```

Browser: **http://127.0.0.1:5174**

API only: `npm --prefix apps/org-supervisor-dashboard run dev:api` → `http://127.0.0.1:9478/api/org-supervisors`

Production-style (built static + API):

```powershell
npm --prefix apps/org-supervisor-dashboard run build
npm --prefix apps/org-supervisor-dashboard run start
```

Then open **http://127.0.0.1:9478** (single port serves UI + API).

## Required environment

Copy `li-cursor-agents/.env.example` → `.env`. For the **production view** (homelab parity):

| Variable | Required | Notes |
|----------|----------|-------|
| `SUPABASE_URL` | yes for DB view | Same project homelab supervisors write to |
| `SUPABASE_SERVICE_ROLE_KEY` | yes for DB view | Read `org_supervisor_cycles` |
| `GH_TOKEN` | optional | Live open counts via `scripts/org-*-open-count.py` in file fallback |
| `KUBECONFIG` | optional | Display only; e.g. `C:\Users\Julian\.kube\config-homelab` |

Mock/demo without credentials:

```powershell
$env:LI_ORG_SUPERVISOR_DASHBOARD_MOCK = "1"
npm run dashboard:org-supervisors
```

## Data wiring

| Mode | When | Source |
|------|------|--------|
| **supabase** | URL + service key set, rows present | `org_supervisor_cycles` per `supervisor_kind` |
| **files** | No DB rows or Supabase disabled | `data/goal-directed-sprints/org-*-active.json`, queue JSON, audit JSONL tails |
| **mock** | `LI_ORG_SUPERVISOR_DASHBOARD_MOCK=1` | In-memory fixtures |

Audit files (PVC mirror locally):

- `org-issue-implement-audit.jsonl`
- `org-pr-implement-audit.jsonl`
- `org-pr-review-audit.jsonl`

Homelab supervisors persist cycles each tick when Supabase is configured in-cluster. The dashboard does **not** call kubectl in v1; use the embedded log/job commands against `config-homelab` / namespace `li-swarm`.

Example:

```powershell
$env:KUBECONFIG = "C:\Users\Julian\.kube\config-homelab"
kubectl -n li-swarm logs deploy/li-org-issue-supervisor -f --tail=100
```

## App location

`apps/org-supervisor-dashboard/` — Vite + React UI, small Node API (`server/`).

Root npm script: `dashboard:org-supervisors`.

## UX notes

Dark theme aligned with `dashboard-ui` tokens. Layout follows the ux-harness web_gui pattern: status at a glance, scannable tables, kubectl hints at the bottom of each column. No auth in v1 (local dev only).
