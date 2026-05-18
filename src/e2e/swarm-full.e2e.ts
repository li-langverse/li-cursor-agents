/**
 * Full async swarm on isolated disk store (mock) — lanes + worker pool, no prod DB.
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { startAsyncSwarm, stopAsyncSwarm, isAsyncSwarmRunning } from "../async-swarm/async-swarm-runtime.js";
import { loadState, saveState } from "../control-plane/state.js";
import { mockRunsDir, runsDir } from "../control-plane/paths.js";
import { setupE2eEnv } from "./helpers.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("full mock swarm e2e (disk)", () => {
  let env: ReturnType<typeof setupE2eEnv>;

  before(() => {
    env = setupE2eEnv("v1");
    const state = loadState();
    state.last_briefing_hash = "e2e-swarm-full";
    saveState(state);
  });

  after(async () => {
    await stopAsyncSwarm();
    env?.restoreEnv();
  });

  test("async swarm starts lanes and produces mock runs under isolated runs dir", async () => {
    assert.equal(isAsyncSwarmRunning(), false);

    const start = await startAsyncSwarm({ mock: true, stopSupervisor: true });
    assert.equal(start.started, true);
    assert.equal(isAsyncSwarmRunning(), true);

    await sleep(4_000);

    const mdRuns = [
      ...readdirSync(runsDir()).filter((f) => f.endsWith(".md")),
      ...readdirSync(mockRunsDir()).filter((f) => f.endsWith(".md")),
    ];
    assert.ok(
      mdRuns.length >= 1,
      `expected mock runs under ${runsDir()} or ${mockRunsDir()}, got ${mdRuns.length}`,
    );

    const state = loadState();
    assert.ok(
      state.recent_tasks.length >= 1 || mdRuns.length >= 1,
      "expected lane tick to record recent_tasks or write mock run files",
    );

    const stop = await stopAsyncSwarm();
    assert.equal(stop.stopped, true);
    assert.equal(isAsyncSwarmRunning(), false);
  });
});
