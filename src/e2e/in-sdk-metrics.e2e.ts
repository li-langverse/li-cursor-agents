/**
 * Regression: /api/status active_run_count reflects in-process runAgent (async swarm path).
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { get } from "node:http";
import { startOpsServer } from "../ops-server.js";
import { runAgent } from "../runner.js";
import { setupE2eEnv } from "./helpers.js";

function httpGetJson(port: number, path: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body) as Record<string, unknown>);
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("in-sdk metrics e2e", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  let server: Server;
  const prevDelay = process.env.LI_MOCK_RUN_DELAY_MS;

  after(() => {
    server?.close();
    env?.restoreEnv();
    if (prevDelay === undefined) delete process.env.LI_MOCK_RUN_DELAY_MS;
    else process.env.LI_MOCK_RUN_DELAY_MS = prevDelay;
  });

  test("status reports active runs while runAgent is in flight", async () => {
    env = setupE2eEnv("v1");
    process.env.LI_MOCK_RUN_DELAY_MS = "500";

    server = startOpsServer(0);
    await sleep(100);
    const port = opsPort(server);

    const runPromise = runAgent({
      agentId: "orchestrator",
      cwd: process.cwd(),
      mock: true,
      dryRun: false,
    });

    let sawActive = false;
    for (let i = 0; i < 30; i++) {
      const status = await httpGetJson(port, "/api/status");
      const runtime = status.runtime as { active_run_count?: number } | undefined;
      if ((runtime?.active_run_count ?? 0) >= 1) {
        sawActive = true;
        break;
      }
      await sleep(40);
    }

    await runPromise;
    assert.ok(sawActive, "/api/status should show active_run_count >= 1 during mock runAgent");
  });
});
