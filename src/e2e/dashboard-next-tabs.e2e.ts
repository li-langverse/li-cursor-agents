/**
 * E2E: APIs consumed by the Next.js dashboard (every nav tab + agent detail).
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { get } from "node:http";
import { supervisorTick } from "../supervisor/loop.js";
import { startOpsServer } from "../ops-server.js";
import { setupE2eEnv, defaultTickOpts } from "./helpers.js";

function httpGetJson(port: number, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(body) as Record<string, unknown> });
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

describe("Next.js dashboard tab APIs", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  let server: Server;
  let port = 0;

  after(() => {
    server?.close();
    env?.restoreEnv();
  });

  test("overview, agents, activity, statistics, interventions, heap", async () => {
    env = setupE2eEnv("v1");
    await supervisorTick({ ...defaultTickOpts(env.benchmarksRoot), force: true });
    server = startOpsServer(0);
    await new Promise((r) => setTimeout(r, 200));
    port = opsPort(server);

    const status = await httpGetJson(port, "/api/status");
    assert.equal(status.status, 200);
    assert.ok(status.body.runtime);

    const agents = await httpGetJson(port, "/api/agents");
    assert.equal(agents.status, 200);
    const roster = (agents.body.roster ?? agents.body.agents) as unknown[] | undefined;
    assert.ok(Array.isArray(roster) && roster.length >= 5, "roster for Agents tab");

    const queue = await httpGetJson(port, "/api/queue");
    assert.equal(queue.status, 200);
    assert.ok(Array.isArray(queue.body.queue));

    const report = await httpGetJson(port, "/api/report");
    assert.equal(report.status, 200);

    const activity = await httpGetJson(port, "/api/activity/recent?limit=5");
    assert.equal(activity.status, 200);
    assert.ok(Array.isArray(activity.body.items));

    const stats7d = await httpGetJson(port, "/api/statistics?range=7d");
    assert.equal(stats7d.status, 200);
    const stats = stats7d.body.statistics as Record<string, unknown> | undefined;
    assert.ok(stats && typeof stats.runs_scanned === "number");
    assert.ok(typeof stats.actions_taken === "number");

    const interventions = await httpGetJson(port, "/api/interventions");
    assert.equal(interventions.status, 200);
    assert.ok(Array.isArray(interventions.body.interventions));

    const heap = await httpGetJson(port, "/api/heap");
    assert.equal(heap.status, 200);
    const heapPlan = heap.body.heap_plan as { flat_tasks?: Array<{ agent: string }> } | null;
    assert.ok(heapPlan !== undefined);
    if (heapPlan?.flat_tasks?.length) {
      assert.ok(typeof heapPlan.flat_tasks[0]!.agent === "string", "heap tasks use agent field");
    }

    const detail = await httpGetJson(port, "/api/agents/pr_reviewer/detail");
    assert.equal(detail.status, 200);
    assert.ok((detail.body.agent as { id?: string })?.id === "pr_reviewer");
    assert.ok(Array.isArray(detail.body.runs));
    assert.ok(Array.isArray(detail.body.work_queue));
  });
});
