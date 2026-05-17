import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRuntimeEnv } from "../env.js";
import { dbEnabled } from "./client.js";
import { probeSupabaseRest } from "./rest-health.js";

test("probeSupabaseRest round-trip when Supabase configured", async (t) => {
  loadRuntimeEnv();
  if (!dbEnabled() || process.env.LI_E2E_DB !== "1") {
    t.skip("set LI_E2E_DB=1 and run npm run db:ensure");
    return;
  }
  const r = await probeSupabaseRest();
  assert.equal(r.ok, true, r.error ?? "REST probe failed");
});
