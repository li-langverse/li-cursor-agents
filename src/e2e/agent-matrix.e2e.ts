/**
 * Per-leaf-agent mock E2E — isolated briefing dir per agent (no shared JSON races).
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { runAgent } from "../runner.js";
import { agentsPackageRoot } from "../runner.js";

const LEAVES = AGENT_REGISTRY.filter((a) => a.id !== "orchestrator");

describe("agent matrix (mock)", () => {
  const prevMock = process.env.CURSOR_MOCK;
  const tempDirs: string[] = [];

  after(() => {
    if (prevMock === undefined) delete process.env.CURSOR_MOCK;
    else process.env.CURSOR_MOCK = prevMock;
    for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  });

  for (const def of LEAVES) {
    test(`mock run: ${def.id}`, async () => {
      process.env.CURSOR_MOCK = "1";
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
    });
  }
});
