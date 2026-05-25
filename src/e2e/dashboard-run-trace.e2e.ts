/**
 * E2E: every agent run records runInput + trace (mock) and API exposes them.
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { get } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runAgent } from "../runner.js";
import { startOpsServer } from "../ops-server.js";
import { setupE2eEnv } from "./helpers.js";

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

describe("dashboard run trace e2e", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  let server: Server;

  after(() => {
    server?.close();
    env?.restoreEnv();
  });

  test("mock run persists runInput and trace on disk and via API", async () => {
    env = setupE2eEnv("v1");
    const result = await runAgent({
      agentId: "gap_explorer",
      cwd: env.benchmarksRoot,
      benchmarksRoot: env.benchmarksRoot,
      mock: true,
      dryRun: false,
    });

    assert.ok(result.runInput, "runInput on result");
    assert.equal(result.runInput?.agent_id, "gap_explorer");
    assert.ok(result.runInput?.system_prompt.length > 20);
    assert.ok(result.runInput?.user_message.includes("gap_explorer"));

    assert.ok(result.trace, "trace on result");
    assert.ok(result.trace?.thinking_text.length > 0);
    assert.ok(result.trace?.file_edits.length >= 1);
    assert.ok(result.trace?.steps.length >= 2);

    const jsonPath = result.outputPath.replace(/\.md$/, ".json");
    assert.ok(existsSync(jsonPath));
    const disk = JSON.parse(readFileSync(jsonPath, "utf8")) as {
      runInput?: { user_message: string };
      trace?: { file_edits: unknown[] };
    };
    assert.ok(disk.runInput?.user_message);
    assert.ok(disk.trace?.file_edits?.length);

    server = startOpsServer(0);
    await new Promise((r) => setTimeout(r, 150));
    const port = opsPort(server);
    const runId = result.outputPath.split("/").pop()!.replace(/\.md$/, "");

    const detail = await httpGetJson(port, `/api/runs/${encodeURIComponent(runId)}`);
    assert.equal(detail.status, 200);
    const runInput = detail.body.run_input as { user_message: string; system_prompt: string };
    const trace = detail.body.run_trace as {
      thinking_text: string;
      file_edits: Array<{ path: string }>;
      steps: unknown[];
    };
    assert.ok(runInput.user_message);
    assert.ok(runInput.system_prompt);
    assert.ok(trace.thinking_text);
    assert.ok(trace.file_edits.length >= 1);
    assert.ok(trace.steps.length >= 2);

    const history = await httpGetJson(
      port,
      `/api/agents/${encodeURIComponent("gap_explorer")}/history?limit=5`,
    );
    assert.equal(history.status, 200);
    const histRuns = history.body.runs as Array<{ run_id: string }>;
    const persistMocks = process.env.LI_PERSIST_MOCK_RUNS === "1";
    assert.equal(
      histRuns.some((r) => r.run_id === runId),
      persistMocks,
      persistMocks
        ? "mock runs with LI_PERSIST_MOCK_RUNS=1 appear in agent history"
        : "mock runs must not appear in production agent history",
    );
  });
});
