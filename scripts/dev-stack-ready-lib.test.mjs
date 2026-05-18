import assert from "node:assert/strict";
import test from "node:test";
import { agentsRosterOk, createFetchJson, runtimeSwarmOn } from "./dev-stack-ready-lib.mjs";

test("agentsRosterOk accepts total or roster", () => {
  assert.equal(agentsRosterOk({ total: 12 }), true);
  assert.equal(agentsRosterOk({ roster: [{ id: "a" }] }), true);
  assert.equal(agentsRosterOk({ total: 0, roster: [] }), false);
});

test("runtimeSwarmOn reads async_swarm_running", () => {
  assert.equal(runtimeSwarmOn({ async_swarm_running: true }), true);
  assert.equal(runtimeSwarmOn({}), false);
});

test("createFetchJson aborts slow requests", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_url, init) =>
    new Promise((resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }
    });
  try {
    const fetchJson = createFetchJson("http://127.0.0.1:9", { defaultTimeoutMs: 50 });
    await assert.rejects(() => fetchJson("/slow", { timeoutMs: 50 }), /timed out/);
  } finally {
    globalThis.fetch = original;
  }
});

test("createFetchJson parses JSON body", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    text: async () => JSON.stringify({ ok: true }),
  });
  try {
    const fetchJson = createFetchJson("http://127.0.0.1:9");
    const r = await fetchJson("/api/status");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
  } finally {
    globalThis.fetch = original;
  }
});
