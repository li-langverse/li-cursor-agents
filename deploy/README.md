# Container images (K8s engine workers)

## GHCR image

- **Org-issue worker:** `ghcr.io/li-langverse/li-cursor-agents:latest` (`deploy/Dockerfile`)
- **Proof explorer:** `ghcr.io/li-langverse/li-cursor-agents:proof-explorer` (`deploy/Dockerfile.proof-explorer`)

CI publishes `:latest` via [publish-org-issue-image.yml](../.github/workflows/publish-org-issue-image.yml) (`workflow_dispatch` or push to `main`).

### Easiest: publish from GitHub Actions (no `write:packages` on your machine)

```powershell
.\scripts\publish-org-image-via-actions.ps1 -Ref main
```

Or open **Actions → Publish org-issue worker image → Run workflow** (pick branch/ref). Uses `GITHUB_TOKEN` with `packages: write` in the workflow.

### Local push (needs classic PAT with `write:packages`)

Add to `li/.env.github`:

```env
GHCR_PUSH_TOKEN=ghp_...
```

Then:

```powershell
.\scripts\push-org-image-latest.ps1
```

## Local build (Windows + Podman)

Native Windows `podman` can fail on `known_hosts` when talking to GHCR. Use the Podman machine VM:

```powershell
# From repo root; token in ../.env.github as GH_TOKEN (needs write:packages for push)
$tok = (Get-Content ..\.env.github | Where-Object { $_ -match '^\s*GH_TOKEN=' }) -replace '^\s*GH_TOKEN=\s*',''
Set-Content -Path .ghcr-token.tmp -Value $tok.Trim().Trim('"') -NoNewline
podman machine ssh -- bash deploy/podman-build-push.sh
Remove-Item .ghcr-token.tmp -Force
```

VM path: `/mnt/c/Users/Julian/Documents/Programming/li/li-cursor-agents`

Or run only inside the VM:

```bash
bash deploy/podman-build-push.sh   # expects .ghcr-token.tmp with PAT
```

If push fails with `permission_denied` / scope errors, regenerate `GH_TOKEN` with **write:packages** or trigger the GitHub Actions publish workflow instead.