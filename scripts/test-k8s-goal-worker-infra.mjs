#!/usr/bin/env node
/**
 * Regression tests for K8s goal-worker infra: GitLab remotes, OOM caps, memory limits.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  const path = join(root, rel);
  assert.ok(existsSync(path), `missing ${rel}`);
  return readFileSync(path, "utf8");
}

const runtime = read("deploy/k8s/engine/configmap-goal-worker-runtime.yaml");
assert.match(runtime, /LI_SDK_MAX_CONCURRENT:\s*"1"/);
assert.match(runtime, /NODE_OPTIONS:/);
assert.match(runtime, /CMAKE_BUILD_PARALLEL_LEVEL:/);

const gitLangverseEntrypoints = [
  "deploy/li-research-product-entrypoint.sh",
  "deploy/li-research-ingest-entrypoint.sh",
  "deploy/li-db-studio-product-entrypoint.sh",
];

for (const rel of gitLangverseEntrypoints) {
  const text = read(rel);
  assert.match(
    text,
    /li_git_ensure_remotes[\s\S]*li_git_sync_repo/,
    `${rel} must migrate PVC clones via li_git_ensure_remotes + li_git_sync_repo`,
  );
  assert.doesNotMatch(
    text,
    /clone_or_sync\(\)[\s\S]*?git -C "\$dest" fetch origin --prune[\s\S]*?\}/,
    `${rel} must not raw-fetch origin in clone_or_sync`,
  );
}

const selfUnblock = read("scripts/goal-loop-self-unblock.sh");
assert.match(selfUnblock, /li_git_ensure_remotes/);
assert.match(selfUnblock, /goal_loop_sync_cwd_from_origin/);

const parallelDep = read("deploy/k8s/engine/deployment-li-parallel.yaml");
assert.match(parallelDep, /serviceAccountName: li-goal-worker/);
assert.match(parallelDep, /memory: "8Gi"/);
assert.match(parallelDep, /li-goal-worker-runtime/);

const rbac = read("deploy/k8s/engine/rbac-goal-workers-scale.yaml");
assert.match(rbac, /li-li-parallel/);

const llvmAgentDeploys = [
  "deploy/k8s/engine/deployment-proof-explorer.yaml",
  "deploy/k8s/engine/deployment-li-research-product.yaml",
  "deploy/k8s/engine/deployment-li-parallel.yaml",
];

for (const rel of llvmAgentDeploys) {
  const text = read(rel);
  assert.match(text, /memory: "8Gi"/, `${rel} needs 8Gi limit for agent+LLVM`);
  assert.match(text, /li-goal-worker-runtime/, `${rel} needs runtime configmap envFrom`);
}

const engineDir = join(root, "deploy/k8s/engine");
for (const name of readdirSync(engineDir)) {
  if (!name.startsWith("deployment-") || !name.endsWith(".yaml")) continue;
  const text = readFileSync(join(engineDir, name), "utf8");
  if (!text.includes("goal-directed-agent")) continue;
  assert.doesNotMatch(text, /memory: "4Gi"/, `${name} must not keep 4Gi memory limit`);
}

console.log("test-k8s-goal-worker-infra: ok");
