/**
 * E2E: preflight → briefing → task queue → agent runs → report → dashboard API.
 * Runs in CI with CURSOR_MOCK=1 (no API key). Real SDK: npm run test:e2e:sdk
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { get } from "node:http";
import { supervisorTick } from "../supervisor/loop.js";
import type { Server } from "node:http";
import { startOpsServer } from "../ops-server.js";
import { reportPath, interventionsPath } from "../control-plane/paths.js";
import { setupE2eEnv, readReport, defaultTickOpts } from "./helpers.js";
import { agentsPackageRoot } from "../runner.js";

function httpGetJson(port: number, path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function opsPort(server: Server): number {
  const addr = server.address();
  if (addr && typeof addr === "object") return addr.port;
  throw new Error("ops server not listening");
}

describe("swarm handoff e2e (mock)", () => {
  let env: ReturnType<typeof setupE2eEnv>;

  after(() => {
    env?.restoreEnv();
  });

  test("tick1–2: handoff in goal order, then anti-cycle on same briefing", async () => {
    env = setupE2eEnv("v1");
    const tick = await supervisorTick(defaultTickOpts(env.benchmarksRoot));
    assert.equal(tick.tasksExecuted, 2, "should run both recommended agents");
    assert.ok(tick.interventions >= 1, "governance PR should flag intervention");

    const report = readReport(env.controlPlaneDir);
    const heap = report.heap_plan as { layers?: unknown[] };
    assert.ok(heap?.layers && heap.layers.length >= 1, "report includes heap_plan");
    const rec = report.recommended_agents as Array<{ agent: string }>;
    assert.deepEqual(
      rec.map((r) => r.agent),
      ["pr_alignment", "gap_explorer"],
      "report preserves briefing goal order",
    );

    const runs = report.recent_runs as Array<{
      agentId: string;
      status: string;
      outputPath?: string;
    }>;
    assert.equal(runs.length, 2);
    assert.equal(runs[0]?.agentId, "pr_alignment", "first handoff matches top priority task");
    assert.equal(runs[1]?.agentId, "gap_explorer");
    assert.equal(runs[0]?.status, "finished");

    const runMetaPath = runs[0]?.outputPath?.replace(/\.md$/, ".json");
    assert.ok(runMetaPath && existsSync(runMetaPath), "run metadata json written");
    const meta = JSON.parse(readFileSync(runMetaPath!, "utf8")) as {
      briefing_hash?: string;
      reason?: string;
    };
    assert.ok(
      String(meta.reason).includes("e2e: open PRs need alignment first"),
      "run metadata preserves reason through heap coordinator",
    );
    assert.equal(meta.briefing_hash, report.briefing_hash);

    const tick2 = await supervisorTick({
      ...defaultTickOpts(env.benchmarksRoot),
      force: false,
      maxTasksPerTick: 2,
      cooldownMs: 3_600_000,
    });
    assert.equal(tick2.tasksExecuted, 0, "cooldown prevents re-run of same tasks");
    assert.equal(tick2.tasksSkippedCooldown, 2, "both recommended agents deduped");
  });

  test("goal shift: new briefing routes to numerics_researcher", async () => {
    env.restoreEnv();
    env = setupE2eEnv("v2");
    const tick = await supervisorTick({
      ...defaultTickOpts(env.benchmarksRoot),
      force: true,
    });
    assert.equal(tick.tasksExecuted, 1);
    const report = readReport(env.controlPlaneDir);
    const runs = (report.recent_runs as Array<{ agentId: string; briefing_hash?: string }>).filter(
      (r) => r.briefing_hash === report.briefing_hash,
    );
    assert.equal(runs[0]?.agentId, "numerics_researcher");
    const interventions = report.interventions as Array<{ kind: string }>;
    assert.ok(interventions.some((i) => i.kind === "ci_red"));
  });

  test("dashboard API serves report and interventions after supervisor tick", async () => {
    env.restoreEnv();
    env = setupE2eEnv("v1");
    await supervisorTick(defaultTickOpts(env.benchmarksRoot));

    assert.ok(existsSync(reportPath()));
    assert.ok(existsSync(interventionsPath()));

    const server = startOpsServer(0);
    await new Promise((r) => setTimeout(r, 150));
    const port = opsPort(server);

    try {
      const report = (await httpGetJson(port, "/api/report")) as Record<string, unknown>;
      assert.ok(report.recommended_agents, "dashboard report endpoint");
      const interventions = (await httpGetJson(port, "/api/interventions")) as {
        interventions: unknown[];
      };
      const reportIv = (report.interventions as unknown[]) ?? [];
      assert.ok(
        (interventions.interventions?.length ?? 0) >= 1 || reportIv.length >= 1,
        "governance merge intervention from fixture PR",
      );
      const status = (await httpGetJson(port, "/api/status")) as { state: { runs_total: number } };
      assert.ok(status.state.runs_total >= 2);
    } finally {
      server.close();
    }
  });

  test("handoff artifacts link briefing path under e2e benchmarks", async () => {
    env.restoreEnv();
    env = setupE2eEnv("v1");
    await supervisorTick(defaultTickOpts(env.benchmarksRoot));
    const report = readReport(env.controlPlaneDir);
    const preflight = report.preflight as { briefing_path?: string };
    assert.ok(preflight.briefing_path?.includes("e2e-benchmarks"));
    assert.ok(
      existsSync(join(agentsPackageRoot(), "fixtures", "e2e-benchmarks", "data", "latest", "agent-briefing.json")),
    );
  });
});
