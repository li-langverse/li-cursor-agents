/**
 * E2E: dashboard drilldown APIs (agent detail, run output, heap, roster).
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import type { Server } from "node:http";
import { get, request } from "node:http";
import { supervisorTick } from "../supervisor/loop.js";
import { startOpsServer } from "../ops-server.js";
import { setupE2eEnv, defaultTickOpts } from "./helpers.js";
import { listAgentsPublic } from "../agents/registry.js";

function httpGetJson(port: number, path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(body) });
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function httpPostJson(port: number, path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port, path, method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: body ? JSON.parse(body) : {} });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.end("{}");
  });
}

function opsPort(server: Server): number {
  const addr = server.address();
  if (addr && typeof addr === "object") return addr.port;
  throw new Error("ops server not listening");
}

describe("dashboard drilldown API e2e", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  let server: Server;

  after(() => {
    server?.close();
    env?.restoreEnv();
  });

  test("all drilldown GET endpoints after supervisor tick", async () => {
    env = setupE2eEnv("v1");
    const tick = await supervisorTick({ ...defaultTickOpts(env.benchmarksRoot), force: true });
    assert.ok(tick.tasksExecuted >= 1, "need at least one agent run for run drilldown");

    server = startOpsServer(0);
    await new Promise((r) => setTimeout(r, 200));
    const port = opsPort(server);

    const reportRes = await httpGetJson(port, "/api/report");
    assert.equal(reportRes.status, 200);
    const report = reportRes.body as Record<string, unknown>;
    assert.ok(report.recommended_agents || report.heap_plan, "report payload");

    const agentsRes = await httpGetJson(port, "/api/agents");
    assert.equal(agentsRes.status, 200);
    const agents = agentsRes.body as { agents?: unknown[]; runtime?: unknown };
    assert.ok(Array.isArray(agents.agents) && agents.agents.length >= 10);
    assert.ok(agents.runtime);

    const heapRes = await httpGetJson(port, "/api/heap");
    assert.equal(heapRes.status, 200);
    const heap = heapRes.body as { heap_plan?: unknown };
    assert.ok(heap.heap_plan !== undefined);

    const coordRes = await httpGetJson(port, "/api/coordinators");
    assert.equal(coordRes.status, 200);
    const coords = coordRes.body as { coordinators?: unknown[] };
    assert.ok((coords.coordinators?.length ?? 0) >= 1);

    const ivRes = await httpGetJson(port, "/api/interventions");
    assert.equal(ivRes.status, 200);

    const statusRes = await httpGetJson(port, "/api/status");
    assert.equal(statusRes.status, 200);
    const status = statusRes.body as { state?: { runs_total: number } };
    assert.ok((status.state?.runs_total ?? 0) >= 1);

    const runsRes = await httpGetJson(port, "/api/runs");
    assert.equal(runsRes.status, 200);
    const runsPayload = runsRes.body as { runs?: Array<{ run_id: string; agent_id: string }> };
    assert.ok(runsPayload.runs && runsPayload.runs.length >= 1, "disk runs from supervisor");

    const firstRun = runsPayload.runs![0];
    const runDetailRes = await httpGetJson(port, `/api/runs/${encodeURIComponent(firstRun.run_id)}`);
    assert.equal(runDetailRes.status, 200);
    const runDetail = runDetailRes.body as { run_id: string; output_preview?: string };
    assert.equal(runDetail.run_id, firstRun.run_id);
    assert.ok(
      typeof runDetail.output_preview === "string" && runDetail.output_preview.length > 0,
      "run output drilldown",
    );
    const trace = runDetail as { run_input?: { user_message: string }; run_trace?: { steps: unknown[] } };
    assert.ok(trace.run_input?.user_message, "run_input on detail");
    assert.ok((trace.run_trace?.steps?.length ?? 0) >= 1, "run_trace on detail");

    const agentId = firstRun.agent_id;
    const agentDetailRes = await httpGetJson(
      port,
      `/api/agents/${encodeURIComponent(agentId)}/detail`,
    );
    assert.equal(agentDetailRes.status, 200);
    const agentDetail = agentDetailRes.body as {
      agent: { id: string; name: string };
      status: string;
      runs: unknown[];
    };
    assert.equal(agentDetail.agent.id, agentId);
    assert.ok(agentDetail.agent.name);
    assert.ok(Array.isArray(agentDetail.runs));

    const historyRes = await httpGetJson(
      port,
      `/api/agents/${encodeURIComponent(agentId)}/history?limit=10`,
    );
    assert.equal(historyRes.status, 200);
    const historyBody = historyRes.body as { runs?: unknown[]; agent_id: string };
    assert.equal(historyBody.agent_id, agentId);
    assert.ok(Array.isArray(historyBody.runs));

    const badAgent = await httpGetJson(port, "/api/agents/not-a-real-agent/detail");
    assert.equal(badAgent.status, 404);

    const badRun = await httpGetJson(port, "/api/runs/does-not-exist-0");
    assert.equal(badRun.status, 404);

    for (const id of listAgentsPublic().slice(0, 3).map((a) => a.id)) {
      const d = await httpGetJson(port, `/api/agents/${encodeURIComponent(id)}/detail`);
      assert.equal(d.status, 200, `detail for ${id}`);
    }
  });

  test("static dashboard assets served", async () => {
    if (!server) {
      env = setupE2eEnv("v1");
      server = startOpsServer(0);
      await new Promise((r) => setTimeout(r, 150));
    }
    const port = opsPort(server);

    for (const path of ["/", "/index.html", "/app.js", "/style.css"]) {
      const res = await new Promise<{ status: number; type: string }>((resolve, reject) => {
        get(`http://127.0.0.1:${port}${path}`, (r) => {
          resolve({ status: r.statusCode ?? 0, type: r.headers["content-type"] ?? "" });
        }).on("error", reject);
      });
      assert.equal(res.status, 200, path);
      assert.ok(res.type.length > 0);
    }
  });

  test("POST supervisor start returns feedback and activity log", async () => {
    if (!server) {
      env = setupE2eEnv("v1");
      server = startOpsServer(0);
      await new Promise((r) => setTimeout(r, 150));
    }
    const port = opsPort(server);

    const startRes = await httpPostJson(port, "/api/supervisor/start");
    assert.equal(startRes.status, 200);
    const body = startRes.body as {
      started?: boolean;
      message?: string;
      runtime?: { supervisor_loop_running?: boolean };
    };
    assert.equal(body.started, true);
    assert.ok(body.message?.includes("started"));
    assert.equal(body.runtime?.supervisor_loop_running, true);

    const activity = await httpGetJson(port, "/api/supervisor/activity");
    assert.equal(activity.status, 200);
    const act = activity.body as { loop_running?: boolean; entries?: Array<{ message: string }> };
    assert.equal(act.loop_running, true);
    assert.ok(act.entries?.some((e) => e.message.includes("started")));

    const stopRes = await httpPostJson(port, "/api/supervisor/stop");
    assert.equal(stopRes.status, 200);
  });

  test("POST control endpoints respond", async () => {
    if (!server) {
      env = setupE2eEnv("v1");
      server = startOpsServer(0);
      await new Promise((r) => setTimeout(r, 150));
    }
    const port = opsPort(server);

    const tickRes = await httpPostJson(port, "/api/tick");
    assert.equal(tickRes.status, 200);
    const tickBody = tickRes.body as { ok?: boolean; tick?: unknown };
    assert.equal(tickBody.ok, true);
    assert.ok(tickBody.tick);
  });
});
