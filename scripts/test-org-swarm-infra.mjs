#!/usr/bin/env node
/**
 * Regression tests for org-swarm infra failures:
 * - missing ~/.kube/config-homelab -> kubectl localhost:8080
 * - hotpatch full-dir mount breaking planner jobs
 * - pwsh vs powershell launcher
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  const path = join(root, rel);
  assert.ok(existsSync(path), `missing ${rel}`);
  return readFileSync(path, "utf8");
}

const kubeResolve = read("scripts/lib/resolve-org-swarm-kubeconfig.ps1");
assert.ok(kubeResolve.includes("Test-OrgSwarmKubeClusterReachable"));
assert.ok(kubeResolve.includes("localhost:8080"));
assert.ok(kubeResolve.includes("Ensure-OrgSwarmKubeconfig"));

const sync = read("scripts/sync-kubeconfig-from-beelink.ps1");
assert.ok(sync.includes("Sync-KubeconfigFromBeelink"));
assert.ok(sync.includes("return $null"), "sync must return null when kubeconfig unavailable");

const ps = read("scripts/lib/resolve-powershell.ps1");
assert.ok(ps.includes("Get-OrgSwarmPowerShell"));
assert.ok(ps.includes("pwsh"));
assert.ok(ps.includes("powershell"));

const stats = read("scripts/org-swarm-stats.ps1");
assert.ok(stats.includes("Ensure-OrgSwarmKubeconfig"));

const hotpatch = read("scripts/hotpatch-planner-vertical.ps1");
assert.ok(!hotpatch.includes('mountPath": "/app/dist/org-planner"'));

const k8sClient = read("src/org-planner/org-planner-k8s-client.ts");
assert.ok(k8sClient.includes("export function plannerHotfixVolumeMounts"));
assert.ok(!k8sClient.includes('mountPath: "/app/dist/org-planner"'));

const deploy = read("deploy/k8s/engine/deployment-org-planner-supervisor.yaml");
assert.ok(deploy.includes("mountPath: /hotfix"));
assert.ok(!deploy.includes("mountPath: /app/dist/org-planner"));

const deployScript = read("scripts/deploy-org-swarm-k8s.ps1");
assert.ok(deployScript.includes("GH_SWARM_TOKEN_BACKUP"), "deploy must push backup token to li-agents-secrets");

const pool = read("src/github/github-token-pool.ts");
assert.ok(pool.includes("GH_SWARM_TOKEN_BACKUP"));

const ghcrEnv = read("scripts/lib/ghcr-env.ps1");
assert.ok(ghcrEnv.includes("beelink-cleanup"), "env loader must read beelink-cleanup/.env");
assert.ok(ghcrEnv.includes("homelab-k3s"), "env loader must read beelink-cleanup/homelab-k3s/.env");
assert.ok(ghcrEnv.includes("Resolve-GitHubBackupTokenFromEnv"));

console.log("test-org-swarm-infra: ok");