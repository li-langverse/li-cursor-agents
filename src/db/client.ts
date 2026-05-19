import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseApiUrl } from "./supabase-url.js";

let client: SupabaseClient | null = null;

/** Control-plane persistence backend. Default: supabase. */
export type ControlPlaneStore = "supabase" | "disk";

/**
 * Which database backs the control plane.
 * - `LI_CONTROL_PLANE_STORE=supabase|disk` (default supabase)
 * - Legacy: `LI_STACK_SKIP_SUPABASE=1` → disk
 */
export function configuredStore(): ControlPlaneStore {
  const raw = process.env.LI_CONTROL_PLANE_STORE?.trim().toLowerCase();
  if (raw === "disk" || raw === "supabase") return raw;
  if (process.env.LI_STACK_SKIP_SUPABASE === "1") return "disk";
  return "supabase";
}

export function useSupabaseStore(): boolean {
  return configuredStore() === "supabase";
}

export function useDiskStore(): boolean {
  return configuredStore() === "disk";
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
  if (!useSupabaseStore()) return;
  if (dbEnabled()) return;
  throw new Error(
    "LI_CONTROL_PLANE_STORE=supabase (default) but Supabase is not configured. " +
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

export function getSupabase(): SupabaseClient {
  assertStoreReady();
  if (!dbEnabled()) {
    throw new Error("Supabase not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)");
  }
  if (!client) {
    const url = normalizeSupabaseApiUrl(resolveSupabaseUrl()!);
    client = createClient(url, resolveSupabaseKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Mirror JSON under data/ when using Supabase; always on when store=disk. */
export function exportDiskCacheEnabled(): boolean {
  if (useDiskStore()) return true;
  return process.env.LI_EXPORT_DISK_CACHE === "1";
}
