# Org G&A supervisor (Kubernetes)

Governance & Assurance swarm: audits every org repo across six lanes.

## Lanes

| Lane ID | Agent | Focus |
|---------|-------|-------|
| `unit` | `ga_unit_auditor` | Export coverage, edge cases |
| `integration` | `ga_integration_auditor` | API / module boundaries |
| `e2e` | `ga_e2e_auditor` | README use cases |
| `gui-visual` | `ga_gui_auditor` | Visual + a11y + brand |
| `soc` | `ga_soc_auditor` | CVE / security compliance |
| `documentation` | `ga_docs_auditor` | Docs + Magic Patterns brand |

## Deploy

```bash
kubectl apply -f deploy/k8s/engine/rbac-org-ga-supervisor.yaml
kubectl apply -f deploy/k8s/engine/configmap-org-ga-supervisor.yaml
kubectl apply -f deploy/k8s/engine/deployment-org-ga-supervisor.yaml
```

Or full org stack: `scripts/deploy-org-swarm-k8s.ps1`.

## Config (ConfigMap `li-org-ga-supervisor`)

| Env | Default |
|-----|---------|
| `LI_ORG_GA_SUPERVISOR_ENABLED` | `1` |
| `LI_ORG_GA_SUPERVISOR_INTERVAL_MS` | `900000` (15 min) |
| `LI_ORG_GA_SUPERVISOR_MAX_WORKERS` | `6` |
| `LI_ORG_GA_LANES` | all six lanes |
| `LI_ORG_GA_REPOS_FILE` | `roadmap/.github/li-org-repos.txt` |
| `LI_ORG_GA_STALE_CLAIM_MS` | `7200000` (2h — fail stale claims with no live Job) |
| `LI_ORG_GA_ORPHAN_CLAIM_MS` | `300000` (5m — fail claims never bound to a Job) |

## Self-heal (ghost claims)

If K8s Jobs are deleted while `org-ga-active.json` still lists them as `running`, the queue appears empty (`pending=0`) and the supervisor idles.

**Automatic:** each supervisor tick calls `reconcileGaActiveWithK8sJobs` (same pattern as org-issue / org-pr).

**CronJob (every 15 min):**

```bash
kubectl apply -f deploy/k8s/engine/cronjob-org-ga-reconcile.yaml
```

**Manual:**

```bash
kubectl exec -n li-swarm deploy/li-org-ga-supervisor -- node dist/cli/org-ga-reconcile.js
```

**Meta agent:** when ghost claims persist, `ga_swarm_healer` may run (requires `LI_ORG_SCHEDULE_SWARM_OBSERVER=1`).

The org-swarm stability CronJob fails when the full G&A queue is ghost-blocked.

- `GITLAB_TOKEN`, `CURSOR_API_KEY` — required for real audits
- `MAGIC_PATTERNS_API_KEY` — optional; gui-visual + docs branding

## Local

```bash
LI_ORG_GA_SUPERVISOR_ENABLED=1 npm run agents:org-ga-supervisor
```

## Enforcement rule

Synced via agent-kit: `.cursor/rules/org-ga-enforcement.mdc`
