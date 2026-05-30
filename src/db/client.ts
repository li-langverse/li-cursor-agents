import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseRealtimeOptions } from "./supabase-realtime-transport.js";
import { normalizeSupabaseApiUrl } from "./supabase-url.js";

let client: SupabaseClient | null = null;
let testClientOverride: SupabaseClient | null = null;

/** Control-plane persistence backend. Default: lidb (native embed). */
export type ControlPlaneStore = "supabase" | "disk" | "lidb";

/**
 * Which database backs the control plane.
 * - `LI_CONTROL_PLANE_STORE=supabase|disk|lidb` (default lidb)
 * - Legacy: `LI_STACK_SKIP_SUPABASE=1` → disk
 */
export function configuredStore(): ControlPlaneStore {
  const raw = process.env.LI_CONTROL_PLANE_STORE?.trim().toLowerCase();
  if (raw === "disk" || raw === "supabase" || raw === "lidb") return raw;
  if (process.env.LI_STACK_SKIP_SUPABASE === "1") return "disk";
  return "lidb";
}

export function useSupabaseStore(): boolean {
  return configuredStore() === "supabase";
}

export function useDiskStore(): boolean {
  return configuredStore() === "disk";
}

export function useLidbStore(): boolean {
  return configuredStore() === "lidb";
}

/** Disk JSON mirror and lidb stub persist (until liorm is wired). */
export function useDiskBackedStore(): boolean {
  return useDiskStore() || useLidbStore();
}

/** Lidb engine URL configured (real engine when PH-DB-10 lands). */
export function lidbUrlConfigured(): boolean {
  return Boolean(process.env.LI_LIDB_URL?.trim());
}

/** True when store=lidb and mock harness is off (probe may still fail at runtime). */
export function lidbEnginePersistEnabled(): boolean {
  if (!useLidbStore() || lidbMockEnabled()) return false;
  return Boolean(lidbUrlConfigured() || process.env.LI_DATA_DIR?.trim() || process.env.LIDB_DATA_DIR?.trim());
}

/** Harness / offline: mock liq rows without embedded lidb. */
export function lidbMockEnabled(): boolean {
  return process.env.LI_LIDB_MOCK === "1";
}

/** lidb store is usable: engine URL, mock harness, or LI_DATA_DIR disk stub. */
export function lidbReady(): boolean {
  if (!useLidbStore()) return false;
  if (lidbUrlConfigured() || lidbMockEnabled()) return true;
  const dataDir = process.env.LI_DATA_DIR?.trim();
  return Boolean(dataDir);
}

/** Supabase client is usable (store is supabase and URL + key are set). */
export function dbEnabled(): boolean {
  return useSupabaseStore() && Boolean(resolveSupabaseUrl() && resolveSupabaseKey());
}

export function dataStoreLabel(): ControlPlaneStore {
  return configuredStore();
}

/** Fail fast at dashboard/stack start when store=supabase but env is missing. */
export function assertStoreReady(): void {
  if (useLidbStore()) {
    if (lidbReady()) return;
    throw new Error(
      "LI_CONTROL_PLANE_STORE=lidb but lidb is not ready. " +
        "Set LI_LIDB_URL (lis db start), LI_LIDB_MOCK=1 for harness, or LI_DATA_DIR for disk-backed stub.",
    );
  }
  if (!useSupabaseStore()) return;
  if (dbEnabled()) return;
  throw new Error(
    "LI_CONTROL_PLANE_STORE=supabase but Supabase is not configured. " +
      "Run: npm run db:ensure — or set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env. " +
      "Use disk instead: LI_CONTROL_PLANE_STORE=disk",
  );
}

function supabaseKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    undefined
  );
}

/** E2E / test stack: prefer local test credentials over production cloud. */
function resolveSupabaseUrl(): string | undefined {
  const testUrl = process.env.LI_TEST_SUPABASE_URL?.trim();
  if (process.env.LI_USE_TEST_DATABASE === "1" && testUrl) return testUrl;
  return process.env.SUPABASE_URL?.trim();
}

function resolveSupabaseKey(): string | undefined {
  if (process.env.LI_USE_TEST_DATABASE === "1") {
    return (
      process.env.LI_TEST_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.LI_TEST_SUPABASE_ANON_KEY?.trim() ||
      supabaseKey()
    );
  }
  return supabaseKey();
}

/** Block accidental e2e writes to hosted prod unless explicitly allowed. */
export function assertSafeTestDatabase(): void {
  if (process.env.LI_E2E_ALLOW_PROD_DB === "1") return;
  const url = resolveSupabaseUrl() ?? "";
  if (!url) return;
  if (/\.supabase\.co/i.test(url) && process.env.LI_E2E_USE_SUPABASE === "1") {
    throw new Error(
      "Refusing e2e against hosted Supabase (prod). Use local test DB: npm run db:ensure " +
        "and LI_USE_TEST_DATABASE=1, or set LI_E2E_ALLOW_PROD_DB=1 to override.",
    );
  }
}

export function resetSupabaseClient(): void {
  client = null;
}

/** In-memory Supabase mock for unit tests (`LI_TEST_MODE=1` only). */
export function setSupabaseClientForTest(mock: SupabaseClient | null): void {
  if (process.env.LI_TEST_MODE !== "1") {
    throw new Error("setSupabaseClientForTest requires LI_TEST_MODE=1");
  }
  testClientOverride = mock;
  client = null;
}

export function getSupabase(): SupabaseClient {
  if (testClientOverride) return testClientOverride;
  assertStoreReady();
  if (!dbEnabled()) {
    throw new Error("Supabase not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)");
  }
  if (!client) {
    const url = normalizeSupabaseApiUrl(resolveSupabaseUrl()!);
    client = createClient(url, resolveSupabaseKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...resolveSupabaseRealtimeOptions(),
    });
  }
  return client;
}

/** Mirror JSON under data/ when using Supabase; always on when store=disk or lidb stub. */
export function exportDiskCacheEnabled(): boolean {
  if (useDiskBackedStore()) return true;
  return process.env.LI_EXPORT_DISK_CACHE === "1";
}
