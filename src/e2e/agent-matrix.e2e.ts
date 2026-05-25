/**
 * Per-leaf-agent mock E2E — isolated briefing dir per agent (no shared JSON races).
 * Uses disk control-plane only (never prod Supabase).
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { runAgent } from "../runner.js";
import { agentsPackageRoot } from "../runner.js";
import { leafAgentIds, setupE2eEnv } from "./helpers.js";

const LEAVES = AGENT_REGISTRY.filter((a) => a.id !== "orchestrator");

describe("agent matrix (mock, disk store)", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  const tempDirs: string[] = [];

  before(() => {
    env = setupE2eEnv("v1");
    const ids = leafAgentIds();
    assert.equal(LEAVES.length, ids.length);
    assert.deepEqual(
      new Set(LEAVES.map((a) => a.id)),
      new Set(ids),
      "every registry leaf must have a matrix test",
    );
  });

  after(() => {
    env?.restoreEnv();
    for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  });

  for (const def of LEAVES) {
    const timeoutMs = def.id === "workspace_sweeper" ? 120_000 : 90_000;
    test(
      `mock run: ${def.id}`,
      { timeout: timeoutMs },
      async () => {
        const pkg = agentsPackageRoot();
        const benchRoot = mkdtempSync(join(tmpdir(), `li-agent-matrix-${def.id}-`));
        tempDirs.push(benchRoot);

        const scripts = join(pkg, "fixtures", "e2e-benchmarks", "scripts");
        mkdirSync(join(benchRoot, "scripts"), { recursive: true });
        writeFileSync(
          join(benchRoot, "scripts", "agent-briefing.py"),
          `#!/usr/bin/env python3
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/latest/agent-briefing.json"
rec = [{"agent": "${def.id}", "reason": "matrix e2e: ${def.id}"}]
sys.path.insert(0, "${scripts.replace(/\\/g, "/")}")
from heap_plan import build_heap_plan
data = {
  "recommended_agents": rec,
  "org_roadmap": {"vision_url": "https://github.com/li-langverse/roadmap", "pillars": ["provable"], "loaded_at": "e2e"},
  "heap_plan": build_heap_plan(rec),
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(data, indent=2))
`,
        );
        const proc = spawnSync("python3", [join(benchRoot, "scripts", "agent-briefing.py")], {
          encoding: "utf8",
        });
        assert.equal(proc.status, 0, proc.stderr || proc.stdout);

        process.env.BENCHMARKS_ROOT = benchRoot;
        const result = await runAgent({
          agentId: def.id,
          cwd: pkg,
          benchmarksRoot: benchRoot,
          mock: true,
          dryRun: false,
        });
        if (def.repoWorkflow) {
          assert.ok(
            result.status === "finished" || result.status === "incomplete",
            `${def.id}: ${result.status}`,
          );
        } else {
          assert.equal(result.status, "finished", def.id);
        }
        assert.equal(result.agentId, def.id);
        assert.ok(result.outputPath.endsWith(".md"));
      },
    );
  }
});
