# Org research supervisor (K8s)

Fourth org supervisor blob: spawns **researcher Jobs** for eligible research goals from `config/research-goals.yaml`, rotating through configurable **dimensions** (security, performance, ux, api-coverage by default).

## Architecture

```
li-org-research-supervisor (Deployment)
  └─ tick loop → eligible goals → dimension rotation → li-org-researcher Jobs (max 3)
       ├─ org-research-active.json     (PVC claims + dimensionCursor)
       ├─ org-research-audit.jsonl
       ├─ org-research-dimensions.json (optional PVC override)
       └─ org_supervisor_cycles (supervisor_kind=research) when Supabase configured
```

## Dimension rotation

1. Load dimensions from `data/goal-directed-sprints/org-research-dimensions.json` (PVC) or env `LI_ORG_RESEARCH_DIMENSIONS` (comma-separated).
2. Maintain `dimensionCursor` in `org-research-active.json`.
3. When spawning Job *i*, pick `dimensions[(cursor + offset) % n]`, skipping dimensions already claimed by active Jobs when alternatives exist.
4. Up to **3 parallel Jobs** hit **3 different dimensions** when the dimension list has ≥3 entries and enough open goals.

Worker concurrency: `min(3, max(1, ceil(openGoals / 50)))` where `openGoals` = eligible research goals (cadence-aware, same as research lane).

## CLI

```bash
npm run agents:org-research-supervisor        # supervise loop
npm run agents:org-research-supervisor-wake   # scale Deployment to 1 (CronJob)
node dist/cli/org-researcher.js --research numerics_sota@security --worker-id abc
```

## K8s apply (homelab)

```bash
export KUBECONFIG=~/.kube/config-homelab
kubectl apply -f deploy/k8s/engine/rbac-org-research-supervisor.yaml
kubectl apply -f deploy/k8s/engine/configmap-org-research-supervisor.yaml
kubectl apply -f deploy/k8s/engine/deployment-org-research-supervisor.yaml
kubectl apply -f deploy/k8s/engine/cronjob-org-research-supervisor-wake.yaml
```

## Supabase (homelab)

In-cluster API URL (majico-staging namespace):

`http://supabase-kong.majico-staging.svc.cluster.local:8000`

Patch `li-agents-secrets` in `li-swarm` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (copy service role from `supabase-secrets` in `majico-staging`). All four supervisors + dashboard read these keys.

Apply migrations:

```bash
kubectl exec -n majico-staging postgres-0 -- psql -U postgres -d postgres -f - < supabase/migrations/20260531120000_org_supervisor_cycles.sql
kubectl exec -n majico-staging postgres-0 -- psql -U postgres -d postgres -f - < supabase/migrations/20260531130000_org_supervisor_cycles_research.sql
```

## Secrets

`li-agents-secrets`: `CURSOR_API_KEY` (required for real agent Jobs). Optional: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Dashboard

Org supervisor dashboard (NodePort **30478**) shows a fourth **Research** tab with dimension in active claims. Data source label `Supabase org_supervisor_cycles` when DB rows exist.

See also: [org-pr-reviewer-supervisor-k8s.md](./org-pr-reviewer-supervisor-k8s.md), [org-supervisor-dashboard.md](./org-supervisor-dashboard.md).

### Homelab setup notes

1. **NetworkPolicy** — apply `deploy/k8s/engine/networkpolicy-li-swarm-supabase.yaml` so `li-swarm` pods can reach Kong/REST in `majico-staging`.
2. **JWT service role** — `supabase-secrets.SERVICE_ROLE_KEY` on this cluster is not a JWT; generate HS256 keys from `JWT_SECRET` via `node scripts/lib/supabase-local-keys.mjs "$JWT_SECRET"` and patch `li-agents-secrets`.
3. **PostgREST reload** — after migrations: `NOTIFY pgrst, 'reload schema';` on postgres (included in migration SQL).
4. **Image** — research supervisor CLI ships in the next `ghcr.io/li-langverse/li-cursor-agents:latest` build; scale Deployment to 1 after push.
