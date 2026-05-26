import { createRequire } from "node:module";
import type { RealtimeClientOptions } from "@supabase/realtime-js";

const require = createRequire(import.meta.url);

let cachedTransport: RealtimeClientOptions["transport"] | null | undefined;

/**
 * Supabase realtime-js requires a WebSocket implementation on Node.
 * Node 22+ exposes global WebSocket; older runtimes need the `ws` package.
 */
export function resolveSupabaseRealtimeOptions(): { realtime: RealtimeClientOptions } | Record<string, never> {
  if (typeof globalThis.WebSocket !== "undefined") {
    return {};
  }
  if (cachedTransport === null) {
    return {};
  }
  if (cachedTransport === undefined) {
    try {
      const mod = require("ws") as { default?: RealtimeClientOptions["transport"] };
      cachedTransport = mod.default ?? (mod as RealtimeClientOptions["transport"]);
    } catch {
      cachedTransport = null;
    }
  }
  if (!cachedTransport) {
    return {};
  }
  return { realtime: { transport: cachedTransport } };
}

/** Test hook: reset lazy ws transport cache. */
export function resetSupabaseRealtimeTransportCache(): void {
  cachedTransport = undefined;
}
