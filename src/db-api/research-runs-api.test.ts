import assert from "node:assert/strict";
import test from "node:test";
import { handleDbApiRequest } from "./index.js";

test("GET /api/research/runs returns runs array", async () => {
  process.env.LI_CONTROL_PLANE_STORE = "disk";
  process.env.LI_STACK_SKIP_SUPABASE = "1";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const res = await handleDbApiRequest(
    new Request("http://local/api/research/runs?limit=5"),
    "/api/research/runs",
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    runs: unknown[];
    agent_ids: string[];
    store: string;
  };
  assert.ok(Array.isArray(body.runs));
  assert.ok(body.agent_ids.includes("numerics_researcher"));
  assert.equal(typeof body.store, "string");
});

test("GET /api/research/runs/:id returns 404 for unknown run", async () => {
  process.env.LI_CONTROL_PLANE_STORE = "disk";
  process.env.LI_STACK_SKIP_SUPABASE = "1";

  const res = await handleDbApiRequest(
    new Request("http://local/api/research/runs/no-such-research-run-0"),
    "/api/research/runs/no-such-research-run-0",
  );
  assert.equal(res.status, 404);
});
