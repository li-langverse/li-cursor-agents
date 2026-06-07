import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { plannerHotfixVolumeMounts } from "./org-planner-k8s-client.js";

test("plannerHotfixVolumeMounts uses subPath only (no full-dir overlay)", () => {
  const mounts = plannerHotfixVolumeMounts();
  assert.ok(mounts.length >= 2);
  for (const m of mounts) {
    assert.ok(m.subPath, `mount ${m.mountPath} must use subPath`);
    assert.notEqual(
      m.mountPath,
      "/app/dist/org-planner",
      "full-dir mount hides image modules and breaks runner.js imports",
    );
    assert.ok(
      !m.mountPath.endsWith("/org-planner") || m.subPath,
      "never replace entire org-planner dist directory",
    );
  }
});

test("hotpatch script must not reintroduce full-dir planner hotfix mount", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const hotpatch = readFileSync(join(root, "scripts", "hotpatch-planner-vertical.ps1"), "utf8");
  assert.ok(
    !hotpatch.includes('mountPath": "/app/dist/org-planner"'),
    "hotpatch must not strategic-patch ConfigMap over /app/dist/org-planner",
  );
  assert.ok(
    hotpatch.includes("Ensure-OrgSwarmKubeconfig"),
    "hotpatch must self-heal kubeconfig before kubectl",
  );
});

test("deploy script must ensure kubeconfig before cluster apply", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const deploy = readFileSync(join(root, "scripts", "deploy-org-swarm-k8s.ps1"), "utf8");
  assert.ok(deploy.includes("Ensure-OrgSwarmKubeconfig"));
  assert.ok(deploy.includes("resolve-org-swarm-kubeconfig.ps1"));
});
