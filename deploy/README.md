# Container images (K8s engine workers)

## Shared toolchain base (org-wide)

All agent images **`FROM ghcr.io/li-langverse/lic-ci:debian12-llvm22`** — the same LLVM 22 toolchain image used by `lic` CI and `./scripts/local-ci.sh --docker`.

| File | Role |
|------|------|
| `deploy/lic-ci-base.env` | Pin for build-args (`LI_CI_IMAGE=...`) |
| `lic/docker/ci-debian12-llvm22/` | Source Dockerfile (published from **lic** repo) |
| `lic/scripts/llvm-env.sh` | Source of truth for `LI_LLVM_MAJOR` |

When lic bumps LLVM, publish a new `lic-ci` tag (e.g. `debian12-llvm23`), update `lic-ci-base.env`, rebuild agent images.

Built-in env on the base: `CC=clang-22`, `CXX=clang++-22`, `LLVM_DIR`, `LI_LLVM_MAJOR=22`.

## GHCR images (this repo)

| Tag | Dockerfile | Adds on top of lic-ci |
|-----|------------|------------------------|
| `:latest` | `deploy/Dockerfile` | Node 22, li-cursor-agents app |
| `:proof-explorer` | `deploy/Dockerfile.proof-explorer` | Node 22, gh CLI, goal-directed entrypoint |

CI publishes via [publish-org-issue-image.yml](../.github/workflows/publish-org-issue-image.yml) and [publish-proof-explorer-image.yml](../.github/workflows/publish-proof-explorer-image.yml).

## Local build

```bash
podman pull ghcr.io/li-langverse/lic-ci:debian12-llvm22
podman build -f deploy/Dockerfile.proof-explorer \
  --build-arg LI_CI_IMAGE=ghcr.io/li-langverse/lic-ci:debian12-llvm22 \
  -t ghcr.io/li-langverse/li-cursor-agents:proof-explorer .
```

Windows + Podman: see existing `deploy/podman-build-push*.sh` scripts.
