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

## Secrets

- `GITLAB_TOKEN`, `CURSOR_API_KEY` — required for real audits
- `MAGIC_PATTERNS_API_KEY` — optional; gui-visual + docs branding

## Local

```bash
LI_ORG_GA_SUPERVISOR_ENABLED=1 npm run agents:org-ga-supervisor
```

## Enforcement rule

Synced via agent-kit: `.cursor/rules/org-ga-enforcement.mdc`
