---
workflow_repo: klaut-supabase
branch: cursor/li-db-studio-homelab-p0
org: cap-jmk-launchpad
token_source: beelink-cleanup/.env (GH_TOKEN only — never li/.env.github)
plan: docs/plans/li-db-studio-platform-plan.md
---

# li-db studio — klaut homelab track (cap-jmk-launchpad)

## Credential rule

Use **only** `cap-jmk-launchpad` token from homelab context (`beelink-cleanup/.env`). Do not push to `li-langverse/*`. Manifest working copy: sync `beelink-cleanup/k8s/` → `cap-jmk-launchpad/klaut-*` when push is unblocked.

## North star

Harden homelab data plane and secrets for DataStudio: Supabase stack healthy on k3s, ESO/Vault path for `supabase` namespace, observability hooks. Coordinate with li product track via `docs/plans/coordination-run-3.md` after both gates pass.

## Work packages (this sprint)

| WP | Deliverable |
|----|-------------|
| WP-010 | Supabase smoke documented; fix manifest gaps in `k8s/supabase/`; backup cron healthy |
| WP-070 | ExternalSecrets scaffold for TTS/API namespaces; no literal provider keys in new manifests |
| WP-080 (infra) | OTLP collector scrape targets for future TTS/edge (ConfigMap stubs OK in P0) |

## Phase checklist

| Phase | Key | Deliverable |
|-------|-----|-------------|
| 0 | `p0-baseline` | Capture `kubectl -n supabase get pods` + auth/rest health curls in `docs/runbooks/supabase-k3s-baseline.md` |
| 1 | `p1-manifests` | Harden kong/auth/rest/realtime/storage manifests; README in klaut-supabase |
| 2 | `p2-vault-eso` | Add ExternalSecret templates under `k8s/vault/` or service dirs for supabase + `tts` namespace placeholders |
| 3 | `p3-obs-stub` | Monitoring scrape annotations / ServiceMonitor stub for platform metrics |

Advance only when phase gate passes. Commit on branch `cursor/li-db-studio-homelab-p0` in **klaut-supabase** (and klaut-pro docs if needed).

## Do not

- Create or push `li-langverse/*` repos from this goal.
- Put `GH_TOKEN` from li `.env.github` in any homelab manifest or script.
- Block on `homelab-k3s` full-tree push (known blocked); per-service `klaut-*` repos are OK.

## Completion gate

```bash
set -eu
ROOT="${LI_GOAL_WORKSPACE:-/workspace}"
SUPABASE="${ROOT}/klaut-supabase"
test -d "$SUPABASE/.git"
test -f "$SUPABASE/docs/runbooks/supabase-k3s-baseline.md"
if command -v kubectl >/dev/null 2>&1 && kubectl -n supabase get pods >/dev/null 2>&1; then
  kubectl -n supabase get pods | grep -E 'kong|auth|rest|db' | grep -v Running && exit 1 || true
  for path in /auth/v1/health /rest/v1/; do
    kubectl -n supabase run curl-smoke --rm -i --restart=Never --image=curlimages/curl:8.5.0 -- \
      curl -sf "http://kong:8000${path}" >/dev/null 2>&1 || exit 1
  done
fi
test -f "$SUPABASE/k8s/supabase/kong-deployment.yaml" || test -f "$SUPABASE/k8s/kong-deployment.yaml"
grep -r ExternalSecret "$SUPABASE" >/dev/null 2>&1 || grep -r external-secrets "$SUPABASE" >/dev/null 2>&1
echo "wp-klaut-homelab gate: OK"
```
