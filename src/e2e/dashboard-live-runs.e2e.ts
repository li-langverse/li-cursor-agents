/**
 * E2E: live running agents + run trace drilldown (runtime, history, output).
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { get, request } from "node:http";
import { startOpsServer } from "../ops-server.js";
import { readReport, setupE2eEnv } from "./helpers.js";

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

function httpPostJson(port: number, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port, path, method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: body ? (JSON.parse(body) as Record<string, unknown>) : {} });
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("dashboard live runs and trace e2e", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  let server: Server;
  const prevDelay = process.env.LI_MOCK_RUN_DELAY_MS;

  after(() => {
    server?.close();
    env?.restoreEnv();
    if (prevDelay === undefined) delete process.env.LI_MOCK_RUN_DELAY_MS;
    else process.env.LI_MOCK_RUN_DELAY_MS = prevDelay;
  });

  test("supervisor tick exposes in-process runs then full trace", async () => {
    env = setupE2eEnv("v1");
    process.env.LI_MOCK_RUN_DELAY_MS = "400";
    process.env.LI_AGENTS_COOLDOWN_MS = "0";
    process.env.LI_SUPERVISOR_MAX_TASKS = "1";

    server = startOpsServer(0);
    await sleep(150);
    const port = opsPort(server);

    const tickPromise = httpPostJson(port, "/api/tick");

    let sawLive = false;
    for (let i = 0; i < 40; i++) {
      const rtRes = await httpGetJson(port, "/api/runtime");
      assert.equal(rtRes.status, 200);
      const rt = rtRes.body as {
        active_run_count?: number;
        active_runs?: Array<{ agent_id: string; status: string }>;
        current_supervisor_agent?: string | null;
      };
      const active = rt.active_runs ?? [];
      const running = active.filter((r) => r.status === "running");
      if (running.length > 0 || rt.current_supervisor_agent) {
        sawLive = true;
        assert.ok(running.length >= 1 || rt.current_supervisor_agent, "live supervisor or active run");
        break;
      }
      await sleep(50);
    }

    const tickRes = await tickPromise;
    assert.equal(tickRes.status, 200);
    assert.equal(tickRes.body.ok, true);
    const tick = tickRes.body.tick as { tasksExecuted?: number };
    assert.ok((tick?.tasksExecuted ?? 0) >= 1, "tick should execute at least one agent");
    assert.ok(sawLive, "dashboard should observe running agent during tick");

    const statusRes = await httpGetJson(port, "/api/status");
    const status = statusRes.body as {
      runtime?: {
        active_run_count?: number;
        store?: string;
        active_runs?: Array<{ status: string }>;
      };
      state?: { recent_tasks?: Array<{ agentId: string; status: string }> };
    };
    const activeAfter = (status.runtime?.active_runs as Array<{ status: string }>) ?? [];
    assert.equal(
      activeAfter.filter((r) => r.status === "running").length,
      0,
      "no running agents after tick completes",
    );

    const reportDisk = readReport(env.controlPlaneDir);
    const recentRuns = reportDisk.recent_runs as Array<{ agentId: string; outputPath: string }>;
    assert.ok(recentRuns.length >= 1, "tick produced runs in report");
    const runId = recentRuns[0].outputPath.split("/").pop()!.replace(/\.md$/, "");
    const agentId = recentRuns[0].agentId;

    const runsRes = await httpGetJson(port, "/api/runs");
    const runs = (runsRes.body.runs as Array<{ run_id: string }>) ?? [];
    assert.ok(!runs.some((r) => r.run_id === runId), "mock runs excluded from run catalog");

    const runDetail = await httpGetJson(port, `/api/runs/${encodeURIComponent(runId)}`);
    assert.equal(runDetail.status, 200);
    const detail = runDetail.body as { output_preview?: string; run_id: string };
    assert.equal(detail.run_id, runId);
    assert.ok((detail.output_preview ?? "").length > 20, "run trace has output preview");

    const agentDetail = await httpGetJson(
      port,
      `/api/agents/${encodeURIComponent(agentId)}/detail`,
    );
    assert.equal(agentDetail.status, 200);
    const ad = agentDetail.body as {
      status: string;
      runs: unknown[];
      history: Array<{ run_id: string; summary?: string }>;
    };
    assert.ok(["idle", "cooldown", "recommended"].includes(ad.status), `post-run status: ${ad.status}`);
    const agentRuns = ad.runs as Array<{ run_id: string }>;
    assert.ok(!agentRuns.some((r) => r.run_id === runId), "mock excluded from agent runs");
    assert.ok(!ad.history.some((r) => r.run_id === runId), "mock excluded from agent history");

    const historyRes = await httpGetJson(
      port,
      `/api/agents/${encodeURIComponent(agentId)}/history?limit=5`,
    );
    assert.equal(historyRes.status, 200);
    const hist = historyRes.body as { runs: Array<{ run_id: string }> };
    assert.ok(!hist.runs.some((r) => r.run_id === runId), "mock excluded from history API");
  });

  test("spawned child run appears in runtime then trace", async () => {
    if (!server) {
      env = setupE2eEnv("v1");
      process.env.LI_MOCK_RUN_DELAY_MS = "500";
      server = startOpsServer(0);
      await sleep(150);
    }
    const port = opsPort(server);

    const startRes = await httpPostJson(port, "/api/agents/gap_explorer/start");
    assert.equal(startRes.status, 200);
    const run = startRes.body.run as { run_id: string; agent_id: string };
    assert.ok(run.run_id);

    const rtDuring = await httpGetJson(port, "/api/runtime");
    const active = (rtDuring.body.active_runs as Array<{ run_id: string; status: string }>) ?? [];
    const live = active.find((r) => r.run_id === run.run_id);
    assert.ok(live, "spawned run visible in /api/runtime");
    assert.equal(live?.status, "running");

    for (let i = 0; i < 30; i++) {
      const rt = await httpGetJson(port, "/api/runtime");
      const still = ((rt.body.active_runs as Array<{ run_id: string }>) ?? []).some((r) => r.run_id === run.run_id);
      if (!still) break;
      await sleep(100);
    }

    let runDetailOk = false;
    for (let i = 0; i < 20; i++) {
      const runDetail = await httpGetJson(port, `/api/runs/${encodeURIComponent(run.run_id)}`);
      if (runDetail.status === 200 && (runDetail.body.output_preview as string)?.length > 10) {
        runDetailOk = true;
        break;
      }
      await sleep(100);
    }
    assert.ok(runDetailOk, "run detail trace has output after child finishes");

    const detail = await httpGetJson(port, `/api/agents/gap_explorer/detail`);
    assert.equal(detail.status, 200);
    const d = detail.body as { status: string; runs: Array<{ run_id: string }> };
    assert.ok(d.runs.some((r) => r.run_id === run.run_id), "completed run in agent trace");
  });
});
