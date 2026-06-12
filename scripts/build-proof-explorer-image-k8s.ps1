# Build proof-explorer-llvm22 on engine via Podman, sideload into k3s, optional ghcr push.
# Overlays local toolchain/entrypoint fixes onto git clone before build.
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$Image = "ghcr.io/li-langverse/li-cursor-agents:proof-explorer-llvm22",
    [string]$GitRef = "main",
    [int]$WaitTimeoutSec = 2400,
    [switch]$RestartShards
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Workspace = Split-Path $Root -Parent
$K8s = Join-Path $Root "deploy\k8s\engine"

. (Join-Path $PSScriptRoot "lib\k8s-agents-env.ps1")
Load-K8sAgentsEnv -WorkspaceRoot $Workspace -AgentsRoot $Root
if (-not $env:GH_TOKEN -and $env:GITHUB_TOKEN) { $env:GH_TOKEN = $env:GITHUB_TOKEN }
if (-not $env:GH_TOKEN) { throw "GH_TOKEN required for ghcr push/login" }
if (-not $env:GITLAB_TOKEN) { throw "GITLAB_TOKEN required for in-cluster git clone" }

$env:KUBECONFIG = $KubeConfig

Write-Host "==> overlays configmap from local li-cursor-agents"
$overlayFiles = @(
    "deploy\scripts\ensure-llvm22-toolchain.sh",
    "deploy\proof-explorer-k8s-entrypoint.sh",
    "deploy\Dockerfile.proof-explorer"
)
$cmArgs = @("create", "configmap", "li-proof-explorer-build-overlays", "-n", $Namespace)
foreach ($rel in $overlayFiles) {
    $p = Join-Path $Root $rel
    if (-not (Test-Path $p)) { throw "missing overlay file $p" }
    $name = ($rel -replace '[/\\]', '__')
    $cmArgs += "--from-file=${name}=$p"
}
$cmArgs += "--dry-run=client", "-o", "yaml"
kubectl @cmArgs | kubectl apply -f -

Apply-K8sAgentsSecrets -Namespace $Namespace -RequireGitLab

kubectl apply -f (Join-Path $K8s "namespace.yaml")
kubectl -n $Namespace create secret docker-registry ghcr-li-langverse `
    --docker-server=ghcr.io `
    --docker-username=li-langverse `
    --docker-password=$env:GH_TOKEN `
    --dry-run=client -o yaml | kubectl apply -f -

Write-Host "==> delete prior build job (if any)"
kubectl -n $Namespace delete job build-proof-explorer-image --ignore-not-found --wait=true 2>$null

$jobYaml = @"
apiVersion: batch/v1
kind: Job
metadata:
  name: build-proof-explorer-image
  namespace: $Namespace
  labels:
    app: li-proof-explorer
    app.kubernetes.io/component: image-build
spec:
  ttlSecondsAfterFinished: 3600
  backoffLimit: 1
  template:
    metadata:
      labels:
        app: build-proof-explorer-image
    spec:
      restartPolicy: Never
      nodeSelector:
        kubernetes.io/hostname: engine
      tolerations:
        - key: node.kubernetes.io/disk-pressure
          operator: Exists
          effect: NoSchedule
      volumes:
        - name: workspace
          emptyDir: {}
        - name: podman-storage
          emptyDir: {}
        - name: overlays
          configMap:
            name: li-proof-explorer-build-overlays
        - name: k3s-bin
          hostPath:
            path: /var/lib/rancher/k3s/data/current/bin
            type: Directory
        - name: containerd-sock
          hostPath:
            path: /run/k3s/containerd/containerd.sock
            type: Socket
      initContainers:
        - name: git-clone
          image: alpine/git:latest
          env:
            - name: GITLAB_TOKEN
              valueFrom:
                secretKeyRef:
                  name: li-agents-secrets
                  key: GITLAB_TOKEN
            - name: GIT_REF
              value: "$GitRef"
          command:
            - sh
            - -lc
            - |
              set -eu
              dest=/workspace/li-cursor-agents
              hdr="PRIVATE-TOKEN: ${GITLAB_TOKEN}"
              base="http://gitlab.gitlab.svc/li-langverse"
              git -c "http.extraHeader=${hdr}" clone --depth 1 --branch "${GIT_REF}" \
                "${base}/li-cursor-agents.git" "$dest" \
                || git -c "http.extraHeader=${hdr}" clone --depth 1 \
                "${base}/li-cursor-agents.git" "$dest"
              cp /overlays/deploy__scripts__ensure-llvm22-toolchain.sh "$dest/deploy/scripts/ensure-llvm22-toolchain.sh"
              cp /overlays/deploy__proof-explorer-k8s-entrypoint.sh "$dest/deploy/proof-explorer-k8s-entrypoint.sh"
              cp /overlays/deploy__Dockerfile.proof-explorer "$dest/deploy/Dockerfile.proof-explorer"
              chmod +x "$dest/deploy/scripts/ensure-llvm22-toolchain.sh" "$dest/deploy/proof-explorer-k8s-entrypoint.sh"
              test -f "$dest/deploy/Dockerfile.proof-explorer"
          volumeMounts:
            - name: workspace
              mountPath: /workspace
            - name: overlays
              mountPath: /overlays
      containers:
        - name: podman
          image: quay.io/podman/stable:v5.4.2
          securityContext:
            privileged: true
          env:
            - name: GH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: li-agents-secrets
                  key: GH_TOKEN
            - name: IMAGE
              value: "$Image"
            - name: GHCR_USER
              value: li-langverse
            - name: STORAGE_DRIVER
              value: vfs
            - name: BUILDAH_ISOLATION
              value: chroot
          command:
            - bash
            - -lc
            - |
              set -euo pipefail
              cd /workspace/li-cursor-agents
              echo "$GH_TOKEN" | podman login ghcr.io -u "$GHCR_USER" --password-stdin || true
              echo "==> pull lic-ci base"
              podman pull ghcr.io/li-langverse/lic-ci:debian12-llvm22
              echo "==> build $IMAGE"
              podman build -f deploy/Dockerfile.proof-explorer \
                --build-arg LI_CI_IMAGE=ghcr.io/li-langverse/lic-ci:debian12-llvm22 \
                -t "$IMAGE" .
              podman run --rm "$IMAGE" clang-22 --version | head -1
              echo "==> sideload into k3s containerd"
              tar=/tmp/proof-explorer-image.tar
              podman save -o "$tar" "$IMAGE"
              /k3s-bin/ctr --address /run/k3s/containerd/containerd.sock -n k8s.io images import "$tar"
              if podman push "$IMAGE"; then
                echo "pushed to ghcr.io"
              else
                echo "WARN: ghcr push failed; k3s import done" >&2
              fi
          volumeMounts:
            - name: workspace
              mountPath: /workspace
            - name: podman-storage
              mountPath: /var/lib/containers
            - name: k3s-bin
              mountPath: /k3s-bin
              readOnly: true
            - name: containerd-sock
              mountPath: /run/k3s/containerd/containerd.sock
"@

$jobYaml | kubectl apply -f -

Write-Host "==> wait for build job (timeout ${WaitTimeoutSec}s)"
kubectl -n $Namespace wait --for=condition=complete job/build-proof-explorer-image --timeout="${WaitTimeoutSec}s"
if ($LASTEXITCODE -ne 0) {
    kubectl -n $Namespace logs job/build-proof-explorer-image -c git-clone --tail=40 2>$null
    kubectl -n $Namespace logs job/build-proof-explorer-image -c podman --tail=60 2>$null
    throw "build-proof-explorer-image job failed"
}

kubectl -n $Namespace logs job/build-proof-explorer-image -c podman --tail=20

if ($RestartShards) {
    Write-Host "==> restart proof-explorer shards"
    foreach ($i in 0..5) {
        kubectl -n $Namespace rollout restart "deploy/li-proof-explorer-shard-$i" 2>$null
    }
    kubectl -n $Namespace rollout restart deploy/li-proof-explorer-unblocker 2>$null
}

Write-Host ""
Write-Host "=== proof-explorer image built: $Image ==="
