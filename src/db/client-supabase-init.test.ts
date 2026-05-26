import assert from "node:assert/strict";
import { test } from "node:test";
import { getSupabase, resetSupabaseClient } from "./client.js";
import { resetSupabaseRealtimeTransportCache } from "./supabase-realtime-transport.js";

test("getSupabase initializes without WebSocket error when ws fallback is available", () => {
  const prevWs = globalThis.WebSocket;
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevStore = process.env.LI_CONTROL_PLANE_STORE;
  const prevSkip = process.env.LI_STACK_SKIP_SUPABASE;

  // @ts-expect-error test override
  delete globalThis.WebSocket;
  resetSupabaseRealtimeTransportCache();
  resetSupabaseClient();

  process.env.LI_CONTROL_PLANE_STORE = "supabase";
  delete process.env.LI_STACK_SKIP_SUPABASE;
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

  try {
    const client = getSupabase();
    assert.ok(client.from, "expected REST client");
    assert.ok(client.realtime, "expected realtime client");
  } finally {
    resetSupabaseClient();
    resetSupabaseRealtimeTransportCache();
    if (prevWs !== undefined) globalThis.WebSocket = prevWs;
    if (prevUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    if (prevStore === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
    else process.env.LI_CONTROL_PLANE_STORE = prevStore;
    if (prevSkip === undefined) delete process.env.LI_STACK_SKIP_SUPABASE;
    else process.env.LI_STACK_SKIP_SUPABASE = prevSkip;
  }
});
