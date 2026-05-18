/**
 * E2E: async swarm start/stop via worker (ops-server) — mock backend, no API key.
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { get, request } from "node:http";
import { startOpsServer } from "../ops-server.js";
import { handleDbApiRequest } from "../db-api/index.js";
import { dbEnabled } from "../db/client.js";
import { setupE2eEnv } from "./helpers.js";

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
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
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

async function dbGetStatus(): Promise<{ async_swarm_running?: boolean }> {
  const res = await handleDbApiRequest(
    new Request("http://localhost/api/status"),
    "/api/status",
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    runtime?: { async_swarm_running?: boolean };
    async_swarm_running?: boolean;
  };
  return {
    async_swarm_running:
      body.async_swarm_running ?? body.runtime?.async_swarm_running ?? false,
  };
}

describe("worker async swarm e2e", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  let server: Server;

  after(async () => {
    if (server) {
      await httpPostJson(opsPort(server), "/api/async-swarm/stop").catch(() => {});
      server.close();
    }
    env?.restoreEnv();
  });

  test("POST async-swarm/start runs lanes + workers; db-api reads status; stop clears", async () => {
    env = setupE2eEnv("v1");
    server = startOpsServer(0);
    await new Promise((r) => setTimeout(r, 200));
    const port = opsPort(server);

    const before = await httpGetJson(port, "/api/status");
    assert.equal(before.status, 200);
    const beforeRt = (before.body as { runtime?: { async_swarm_running?: boolean } }).runtime;
    assert.equal(beforeRt?.async_swarm_running, false);

    const start = await httpPostJson(port, "/api/async-swarm/start");
    assert.equal(start.status, 200);
    const startBody = start.body as {
      ok?: boolean;
      started?: boolean;
      runtime?: { async_swarm_running?: boolean };
    };
    assert.equal(startBody.ok ?? startBody.started, true);
    assert.equal(startBody.runtime?.async_swarm_running, true);

    const status = await httpGetJson(port, "/api/status");
    assert.equal(status.status, 200);
    const rt = (status.body as { runtime?: { async_swarm_running?: boolean } }).runtime;
    assert.equal(rt?.async_swarm_running, true);

    if (dbEnabled()) {
      const dbStatus = await dbGetStatus();
      assert.equal(dbStatus.async_swarm_running, true, "db-api should reflect worker_status row");
    }

    const stop = await httpPostJson(port, "/api/async-swarm/stop");
    assert.equal(stop.status, 200);
    const stopBody = stop.body as { ok?: boolean; stopped?: boolean };
    assert.equal(stopBody.ok ?? stopBody.stopped, true);

    const after = await httpGetJson(port, "/api/status");
    const afterRt = (after.body as { runtime?: { async_swarm_running?: boolean } }).runtime;
    assert.equal(afterRt?.async_swarm_running, false);
  });
});
