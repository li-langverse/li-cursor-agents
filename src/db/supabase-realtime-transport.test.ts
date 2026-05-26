import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resetSupabaseRealtimeTransportCache,
  resolveSupabaseRealtimeOptions,
} from "./supabase-realtime-transport.js";

test("resolveSupabaseRealtimeOptions uses ws when global WebSocket is missing", () => {
  const prev = globalThis.WebSocket;
  // @ts-expect-error test override
  delete globalThis.WebSocket;
  resetSupabaseRealtimeTransportCache();
  try {
    const opts = resolveSupabaseRealtimeOptions();
    assert.ok(opts.realtime?.transport, "expected ws transport fallback");
  } finally {
    if (prev !== undefined) {
      globalThis.WebSocket = prev;
    }
    resetSupabaseRealtimeTransportCache();
  }
});

test("resolveSupabaseRealtimeOptions is empty when native WebSocket exists", () => {
  if (typeof globalThis.WebSocket === "undefined") {
    return;
  }
  resetSupabaseRealtimeTransportCache();
  const opts = resolveSupabaseRealtimeOptions();
  assert.equal(Object.keys(opts).length, 0);
});
