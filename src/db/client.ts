import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseApiUrl } from "./supabase-url.js";

let client: SupabaseClient | null = null;

/** Control-plane persistence backend. Default: supabase. */
export type ControlPlaneStore = "supabase" | "disk" | "lidb";

/**
 * Which database backs the control plane.
 * - `LI_CONTROL_PLANE_STORE=supabase|disk|lidb` (default supabase)
 * - Legacy: `LI_STACK_SKIP_SUPABASE=1` → disk
 */
export function configuredStore(): ControlPlaneStore {
  const raw = process.env.LI_CONTROL_PLANE_STORE?.trim().toLowerCase();
  if (raw === "disk" || raw === "supabase" || raw === "lidb") return raw;
  if (process.env.LI_STACK_SKIP_SUPABASE === "1") return "disk";
  return "supabase";
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

/** Supabase client is usable (store is supabase and URL + key are set). */
export function dbEnabled(): boolean {
  return useSupabaseStore() && Boolean(process.env.SUPABASE_URL?.trim() && supabaseKey());
}

export function dataStoreLabel(): ControlPlaneStore {
  return configuredStore();
}

/** Fail fast at dashboard/stack start when store=supabase but env is missing. */
export function assertStoreReady(): void {
  if (useLidbStore()) {
    if (lidbStoreReady()) return;
    throw new Error(
      "LI_CONTROL_PLANE_STORE=lidb but lidb is not configured. " +
        "Set LI_LIDB_URL (lis db start) or LI_LIDB_MOCK=1 for disk-mirror dev stub. " +
        "Supabase vars are not required when store=lidb.",
    );
  }
  if (!useSupabaseStore()) return;
  if (dbEnabled()) return;
  throw new Error(
    "LI_CONTROL_PLANE_STORE=supabase (default) but Supabase is not configured. " +
      "Run: npm run db:ensure — or set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env. " +
      "Use disk instead: LI_CONTROL_PLANE_STORE=disk",
  );
}

/** lidb store: engine URL or mock disk-mirror dev stub. */
export function lidbStoreReady(): boolean {
  return Boolean(process.env.LI_LIDB_URL?.trim()) || process.env.LI_LIDB_MOCK === "1";
}

function supabaseKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    undefined
  );
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
    const url = normalizeSupabaseApiUrl(process.env.SUPABASE_URL!);
    client = createClient(url, supabaseKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Mirror JSON under data/ when using Supabase; always on when store=disk or lidb. */
export function exportDiskCacheEnabled(): boolean {
  if (useDiskStore() || useLidbStore()) return true;
  return process.env.LI_EXPORT_DISK_CACHE === "1";
}
