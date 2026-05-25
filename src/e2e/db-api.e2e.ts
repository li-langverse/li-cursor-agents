/**
 * E2E: read-only db-api (no worker required for GET).
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { supervisorTick } from "../supervisor/loop.js";
import { handleDbApiRequest } from "../db-api/index.js";
import { setupE2eEnv, defaultTickOpts } from "./helpers.js";

async function dbGet(path: string): Promise<{ status: number; body: unknown }> {
  const res = await handleDbApiRequest(
    new Request(`http://localhost${path}`),
    path.startsWith("/") ? path : `/${path}`,
  );
  const body = await res.json();
  return { status: res.status, body };
}

describe("db-api read-only e2e", () => {
  let env: ReturnType<typeof setupE2eEnv>;

  after(() => {
    env?.restoreEnv();
  });

  test("GET endpoints after supervisor tick (disk store)", async () => {
    env = setupE2eEnv("v1");
    const tick = await supervisorTick({ ...defaultTickOpts(env.benchmarksRoot), force: true });
    assert.ok(tick.tasksExecuted >= 1);

    const agents = await dbGet("/api/agents");
    assert.equal(agents.status, 200);
    const roster = agents.body as { roster?: unknown[] };
    assert.ok(Array.isArray(roster.roster) && roster.roster.length > 0);

    const status = await dbGet("/api/status");
    assert.equal(status.status, 200);

    const post = await handleDbApiRequest(
      new Request("http://localhost/api/supervisor/start", { method: "POST" }),
      "/api/supervisor/start",
    );
    assert.equal(post.status, 405);
    const errBody = (await post.json()) as { error?: string };
    assert.match(errBody.error ?? "", /GET-only|worker/i);
  });
});
