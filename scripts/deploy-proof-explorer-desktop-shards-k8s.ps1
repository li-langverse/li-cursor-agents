# Deploy 6 proof-explorer shards + unblocker on desktop node (burst pool).
# Node choice: desktop (32c/32Gi, burst taint) — never engine (74%+ memory requests, OOM during clone/agent peaks).
param(
    [string]$KubeConfig = "$env:USERPROFILE\.kube\config-homelab",
    [string]$Namespace = "li-swarm",
    [string]$DesktopNode = "desktop",
    [int]$ShardCount = 6,
    [int]$ShardMemoryLimitGi = 4,
    [int]$InitStaggerSec = 60,
    [switch]$KeepEngineWorker
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$K8sDesktop = Join-Path $Root "deploy\k8s\desktop"
$K8sEngine = Join-Path $Root "deploy\k8s\engine"
$Workspace = Split-Path $Root -Parent
$BundleScript = Join-Path $Root "scripts\Invoke-K8sGoalLoopBundle.ps1"

. (Join-Path $PSScriptRoot "lib\k8s-agents-env.ps1")
Load-K8sAgentsEnv -WorkspaceRoot $Workspace -AgentsRoot $Root
Assert-K8sAgentsDeployTokens

$env:KUBECONFIG = $KubeConfig
Write-Host "==> Deploy proof-explorer shards on node=$DesktopNode (count=$ShardCount)"

kubectl apply -f (Join-Path $K8sEngine "namespace.yaml")
kubectl apply -f (Join-Path $K8sEngine "rbac-goal-workers-scale.yaml")
kubectl apply -f (Join-Path $K8sDesktop "rbac-proof-explorer-unblocker.yaml")
kubectl apply -f (Join-Path $K8sEngine "configmap-k8s-git-primary.yaml") 2>$null
$gitAuthScript = Join-Path $Root "deploy\k8s-git-auth.sh"
kubectl -n $Namespace create configmap li-k8s-git-auth `
  --from-file="k8s-git-auth.sh=$gitAuthScript" `
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f (Join-Path $K8sDesktop "configmap-proof-explorer-shard-base.yaml")

$extra = @{
    "entrypoint.sh" = (Join-Path $Root "deploy\proof-explorer-k8s-entrypoint.sh")
    "wp-p15-shard-tranche.sh" = (Join-Path $Root "deploy\scripts\wp-p15-shard-tranche.sh")
}
. $BundleScript -Root $Root -Namespace $Namespace -ConfigMapName "li-proof-explorer-shard-bundle" -ExtraFiles $extra

$unblockerFiles = @{
    "proof-explorer-shard-unblocker.py" = (Join-Path $Root "deploy\scripts\proof-explorer-shard-unblocker.py")
}
python -c @"
import pathlib, subprocess, os, sys
bundle = pathlib.Path(r'$env:TEMP\li-proof-explorer-unblocker-bundle')
if bundle.exists():
    import shutil
    shutil.rmtree(bundle)
bundle.mkdir()
for name, src in [
    ('proof-explorer-shard-unblocker.py', r'$(Join-Path $Root "deploy\scripts\proof-explorer-shard-unblocker.py")'),
]:
    pathlib.Path(src).read_text(encoding='utf-8')
    text = pathlib.Path(src).read_text(encoding='utf-8').replace('\r\n', '\n')
    (bundle / name).write_text(text, encoding='utf-8', newline='\n')
env = {**os.environ, 'KUBECONFIG': os.environ.get('KUBECONFIG', '')}
args = ['kubectl', '-n', '$Namespace', 'create', 'configmap', 'li-proof-explorer-unblocker-scripts']
for path in bundle.rglob('*'):
    if path.is_file():
        args.extend(['--from-file', f'{path.name}={path}'])
args.extend(['--dry-run=client', '-o', 'yaml'])
proc = subprocess.run(['kubectl', '-n', '$Namespace', 'apply', '-f', '-'], input=subprocess.check_output(args, env=env), env=env)
sys.exit(proc.returncode)
"@

Apply-K8sAgentsSecrets -Namespace $Namespace -RequireGitLab

$tolerationYaml = @"
      tolerations:
        - key: workload
          operator: Equal
          value: burst
          effect: NoSchedule
        - key: node.kubernetes.io/disk-pressure
          operator: Exists
          effect: NoSchedule
"@

# Bash vars must not be expanded by PowerShell's @"..."@ here-string.
$gitSyncScript = @'
              set -eu
              test -n "${GITLAB_TOKEN:-}" || { echo "git-sync: missing GITLAB_TOKEN" >&2; exit 1; }
              if [ -n "${SHARD_INDEX:-}" ]; then
                delay=$((SHARD_INDEX * STAGGER_SEC))
                if [ "$delay" -gt 0 ]; then
                  echo "git-sync: shard ${SHARD_INDEX} sleeping ${delay}s to avoid clone OOM spike"
                  sleep "$delay"
                fi
              fi
              hdr="PRIVATE-TOKEN: ${GITLAB_TOKEN}"
              base="http://10.43.79.43/li-langverse"
              mkdir -p /workspace
              rm -rf /workspace/lic
              echo "git-sync: cloning lic branch=${BRANCH}"
              git -c "http.extraHeader=${hdr}" clone --depth 1 --branch "$BRANCH" "${base}/lic.git" /workspace/lic
              if [ ! -d /workspace/benchmarks/.git ]; then
                git -c "http.extraHeader=${hdr}" clone --depth 1 --branch main "${base}/benchmarks.git" /workspace/benchmarks || true
              fi
              if [ ! -d /workspace/proof-library/.git ]; then
                git -c "http.extraHeader=${hdr}" clone --depth 1 --branch main "${base}/proof-library.git" /workspace/proof-library || true
              fi
'@

for ($i = 0; $i -lt $ShardCount; $i++) {
    $name = "li-proof-explorer-shard-$i"
    Write-Host "==> shard $i ($name)"

    @"
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${name}-workspace
  namespace: $Namespace
  labels:
    app: $name
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 30Gi
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: $name
  namespace: $Namespace
  labels:
    app: $name
data:
  LI_PROOF_EXPLORER_SHARD_INDEX: "$i"
  LI_GOAL_DEPLOYMENT_NAME: "$name"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $name
  namespace: $Namespace
  labels:
    app: $name
    app.kubernetes.io/name: $name
    app.kubernetes.io/component: goal-directed-agent
    li-langverse.io/sprint: proof-explorer-phase15
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: $name
  template:
    metadata:
      labels:
        app: $name
        app.kubernetes.io/name: $name
        app.kubernetes.io/component: goal-directed-agent
        li-langverse.io/sprint: proof-explorer-phase15
    spec:
      serviceAccountName: li-goal-worker
      nodeSelector:
        kubernetes.io/hostname: $DesktopNode
$tolerationYaml
      imagePullSecrets:
        - name: ghcr-li-langverse
      initContainers:
        - name: git-sync
          image: alpine/git:latest
          env:
            - name: GITLAB_TOKEN
              valueFrom:
                secretKeyRef:
                  name: li-agents-secrets
                  key: GITLAB_TOKEN
            - name: BRANCH
              value: "cursor/proof-explorer-phase15-honest-catalog-prove"
            - name: SHARD_INDEX
              value: "$i"
            - name: STAGGER_SEC
              value: "$InitStaggerSec"
          command:
            - sh
            - -lc
            - |
$gitSyncScript
          volumeMounts:
            - name: workspace
              mountPath: /workspace
          resources:
            requests:
              cpu: "200m"
              memory: "256Mi"
            limits:
              cpu: "1"
              memory: "768Mi"
      containers:
        - name: proof-explorer
          image: ghcr.io/li-langverse/li-cursor-agents:proof-explorer-llvm22
          imagePullPolicy: IfNotPresent
          command: ["/bin/bash", "/config/entrypoint.sh"]
          envFrom:
            - configMapRef:
                name: li-proof-explorer-shard-base
            - configMapRef:
                name: $name
            - configMapRef:
                name: li-goal-worker-runtime
          env:
            - name: LI_GIT_HOST
              value: "10.43.79.43"
            - name: LI_GIT_INTERNAL_SVC
              value: "10.43.79.43"
            - name: LI_GIT_SCHEME
              value: "http"
            - name: LI_GIT_NO_GITHUB_MIRROR
              value: "1"
            - name: GH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: li-agents-secrets
                  key: GH_TOKEN
                  optional: true
            - name: GITLAB_TOKEN
              valueFrom:
                secretKeyRef:
                  name: li-agents-secrets
                  key: GITLAB_TOKEN
                  optional: true
            - name: GITHUB_TOKEN
              valueFrom:
                secretKeyRef:
                  name: li-agents-secrets
                  key: GH_TOKEN
            - name: CURSOR_API_KEY
              valueFrom:
                secretKeyRef:
                  name: li-agents-secrets
                  key: CURSOR_API_KEY
                  optional: true
            - name: CURSOR_SDK_KEY
              valueFrom:
                secretKeyRef:
                  name: li-agents-secrets
                  key: CURSOR_SDK_KEY
                  optional: true
          resources:
            requests:
              cpu: "500m"
              memory: "1536Mi"
            limits:
              cpu: "4"
              memory: "${ShardMemoryLimitGi}Gi"
          volumeMounts:
            - name: workspace
              mountPath: /workspace
            - name: config-bundle
              mountPath: /config
            - name: git-auth
              mountPath: /git-auth
              readOnly: true
      volumes:
        - name: workspace
          persistentVolumeClaim:
            claimName: ${name}-workspace
        - name: config-bundle
          configMap:
            name: li-proof-explorer-shard-bundle
            defaultMode: 0755
        - name: git-auth
          configMap:
            name: li-k8s-git-auth
            defaultMode: 0755
"@ | kubectl apply -f -

    kubectl -n $Namespace rollout status "deploy/$name" --timeout=300s
}

@"

apiVersion: apps/v1
kind: Deployment
metadata:
  name: li-proof-explorer-unblocker
  namespace: $Namespace
  labels:
    app: li-proof-explorer-unblocker
    app.kubernetes.io/component: goal-directed-agent
spec:
  replicas: 1
  selector:
    matchLabels:
      app: li-proof-explorer-unblocker
  template:
    metadata:
      labels:
        app: li-proof-explorer-unblocker
    spec:
      serviceAccountName: li-proof-explorer-unblocker
      nodeSelector:
        kubernetes.io/hostname: $DesktopNode
$tolerationYaml
      imagePullSecrets:
        - name: ghcr-li-langverse
      containers:
        - name: unblocker
          image: ghcr.io/li-langverse/li-cursor-agents:proof-explorer-llvm22
          imagePullPolicy: IfNotPresent
          command: ["python3", "/config/proof-explorer-shard-unblocker.py"]
          env:
            - name: LI_GOAL_NAMESPACE
              value: "$Namespace"
            - name: LI_PROOF_EXPLORER_SHARD_TOTAL
              value: "$ShardCount"
            - name: LI_PROOF_EXPLORER_UNBLOCKER_INTERVAL_SEC
              value: "600"
          resources:
            requests:
              cpu: "50m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          volumeMounts:
            - name: scripts
              mountPath: /config
      volumes:
        - name: scripts
          configMap:
            name: li-proof-explorer-unblocker-scripts
            defaultMode: 0755
"@ | kubectl apply -f -

if (-not $KeepEngineWorker) {
    Write-Host "==> Scale engine li-proof-explorer to 0 (shards own phase15)"
    kubectl -n $Namespace scale deploy/li-proof-explorer --replicas=0
}

Write-Host ""
Write-Host "=== proof-explorer desktop shards deployed ==="
kubectl -n $Namespace get deploy -l li-langverse.io/sprint=proof-explorer-phase15 -o wide
Write-Host "  kubectl -n $Namespace get pods -l li-langverse.io/sprint=proof-explorer-phase15 -w"
