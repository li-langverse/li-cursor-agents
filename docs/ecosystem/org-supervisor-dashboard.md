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

API only: `npm --prefix apps/org-supervisor-dashboard run dev:api` â†’ `http://127.0.0.1:9478/api/org-supervisors`

Production-style (built static + API):

```powershell
npm --prefix apps/org-supervisor-dashboard run build
npm --prefix apps/org-supervisor-dashboard run start
```

Then open **http://127.0.0.1:9478** (single port serves UI + API).

## Required environment

Copy `li-cursor-agents/.env.example` â†’ `.env`. For the **production view** (homelab parity):

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

`apps/org-supervisor-dashboard/` â€” Vite + React UI, small Node API (`server/`).

Root npm script: `dashboard:org-supervisors`.

## UX notes

Dark theme aligned with `dashboard-ui` tokens. Layout follows the ux-harness web_gui pattern: status at a glance, scannable tables, kubectl hints at the bottom of each column. No auth in v1 (local dev only).
## Homelab (K8s)

Deployed on the engine **k3s** cluster (namespace `li-swarm`).

| Resource | Name |
|----------|------|
| Deployment | `li-org-supervisor-dashboard` |
| Service | `li-org-supervisor-dashboard` (NodePort **30478** -> container **9478**) |
| In-cluster DNS | `http://li-org-supervisor-dashboard.li-swarm.svc.cluster.local:9478` |
| LAN (any node) | `http://<node-ip>:30478` (engine node: **http://192.168.10.32:30478**) |

Manifests: `deploy/k8s/engine/deployment-org-supervisor-dashboard.yaml`, `service-org-supervisor-dashboard.yaml`, `configmap-org-supervisor-dashboard.yaml`.

Image: `ghcr.io/li-langverse/li-cursor-agents:latest` (dashboard static + API built in `deploy/Dockerfile`).

Apply:

```powershell
$env:KUBECONFIG = "C:\Users\Julian\.kube\config-homelab"
kubectl apply -f deploy/k8s/engine/configmap-org-supervisor-dashboard.yaml `
  -f deploy/k8s/engine/deployment-org-supervisor-dashboard.yaml `
  -f deploy/k8s/engine/service-org-supervisor-dashboard.yaml
```

Port-forward (ClusterIP-style access without NodePort):

```powershell
kubectl -n li-swarm port-forward svc/li-org-supervisor-dashboard 9478:9478
```

Then open **http://127.0.0.1:9478**.

Sprint file fallback reads PVC `li-agents-sprint-data` at `/app/data/goal-directed-sprints` (read-only). Optional Supabase keys on secret `li-agents-secrets` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) enable DB-backed cycles when present.

## Homelab Supabase

In-cluster API (majico-staging): `http://supabase-kong.majico-staging.svc.cluster.local:8000`

Secret `li-agents-secrets` in `li-swarm` must include `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (service role copied from `supabase-secrets` in `majico-staging`). Dashboard shows **Supabase org_supervisor_cycles** when rows exist.

Fourth supervisor kind: **research** — see [org-research-supervisor-k8s.md](./org-research-supervisor-k8s.md).
