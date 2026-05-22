import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Non-empty values from the canonical shared `.env` win over stale Cloud-injected env. */
const DOTENV_OVERRIDE_KEYS = new Set([
  "CURSOR_API_KEY",
  "CURSOR_SDK_KEY",
  "CURSOR_SDK",
  "CURSOR_API_TOKEN",
  "CURSOR_MODEL",
  "GH_TOKEN",
  "GITHUB_TOKEN",
]);

function applyEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (DOTENV_OVERRIDE_KEYS.has(key)) {
      if (!val) continue;
      if (isCursorCredentialEnvName(key) && !isPlausibleCursorApiKey(val)) {
        const existing = process.env[key]?.trim();
        if (existing && isPlausibleCursorApiKey(existing)) continue;
        continue;
      }
      if ((key === "GH_TOKEN" || key === "GITHUB_TOKEN") && val.length < 8) continue;
      process.env[key] = val;
      continue;
    }
    if (!(key in process.env) || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

function packageRoot(): string {
  const env = process.env.LI_CURSOR_AGENTS_ROOT;
  if (env && existsSync(join(env, "package.json"))) return env;
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..");
}

/** Load optional .env from package root or BENCHMARKS_ROOT (KEY=value, no export required). */
export function loadDotEnv(): void {
  if (process.env.LI_SKIP_DOTENV === "1") return;
  const roots = [
    process.env.LI_CURSOR_AGENTS_ROOT,
    process.cwd(),
    process.env.BENCHMARKS_ROOT,
    packageRoot(),
  ].filter(Boolean) as string[];

  for (const root of roots) {
    const path = join(root, ".env");
    if (!existsSync(path)) continue;
    applyEnvFile(path);
    break;
  }
}

/**
 * GitHub org credentials for `gh` and benchmarks preflight (pr-merge-queue, org audits).
 * Canonical file: sibling `../.env.github` (same as lic `scripts/with-github-env.sh`).
 */
export function loadGithubEnv(): void {
  if (process.env.LI_SKIP_GITHUB_ENV === "1") return;

  const explicit = process.env.LI_GITHUB_ENV;
  if (explicit) {
    applyEnvFile(explicit);
    return;
  }

  const pkg = packageRoot();
  const candidates = [
    join(pkg, ".env.github"),
    join(pkg, "..", ".env.github"),
    join(process.cwd(), "..", ".env.github"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      applyEnvFile(path);
      return;
    }
  }
}

/** Absolute path to li-local-ci checkout (sibling of li-cursor-agents). */
export function resolveLocalCiRoot(): string | undefined {
  loadDotEnv();
  const env = process.env.LI_LOCAL_CI_ROOT?.trim();
  if (env && existsSync(join(env, "bin/li-local-ci"))) return env;
  const pkg = packageRoot();
  const sibling = join(pkg, "..", "li-local-ci");
  if (existsSync(join(sibling, "bin/li-local-ci"))) return sibling;
  return undefined;
}

/** Cursor + local .env + GitHub (for dashboard / supervisor / agent children). */
export function loadSupabaseEnv(): void {
  const pkg = packageRoot();
  for (const name of [".env.supabase"]) {
    const path = join(pkg, name);
    if (existsSync(path)) applyEnvFile(path);
  }
  if (!process.env.SUPABASE_DB_URL?.trim()) {
    process.env.SUPABASE_DB_URL =
      process.env.DATABASE_URL?.trim() ||
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  }
}

export function loadRuntimeEnv(): void {
  loadSharedEnv();
  loadDotEnv();
  loadSupabaseEnv();
  loadGithubEnv();
  const localCi = resolveLocalCiRoot();
  if (localCi) process.env.LI_LOCAL_CI_ROOT = localCi;
  if (process.env.LI_USE_LOCAL_CI === undefined) {
    process.env.LI_USE_LOCAL_CI = "1";
  }
  // gh accepts either name; keep both in sync when only GH_TOKEN is set
  if (process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
  }
}

/** Env vars checked for Cursor Cloud / SDK API keys (priority order). */
export const CURSOR_API_KEY_ENV_NAMES = [
  "CURSOR_API_KEY",
  "CURSOR_SDK_KEY",
  "CURSOR_SDK",
  "CURSOR_API_TOKEN",
] as const;

function isCursorCredentialEnvName(name: string): boolean {
  return (
    name === "CURSOR_API_KEY" ||
    name === "CURSOR_SDK_KEY" ||
    name === "CURSOR_SDK" ||
    name === "CURSOR_API_TOKEN"
  );
}

/**
 * Reject common misconfigurations (dashboard URL pasted as "key", empty, too short).
 * Real user API keys from cursor.com/dashboard/integrations are never http(s) URLs.
 */
export function isPlausibleCursorApiKey(value: string | undefined): boolean {
  const v = value?.trim();
  if (!v || v.length < 16) return false;
  if (/^https?:\/\//i.test(v)) return false;
  if (/cursor\.com\/dashboard/i.test(v)) return false;
  if (/\s/.test(v)) return false;
  return true;
}

/** All set Cursor credential env vars that look like API keys (for diagnostics). */
export function listPlausibleCursorApiKeys(): Array<{ name: string; length: number }> {
  loadRuntimeEnv();
  const out: Array<{ name: string; length: number }> = [];
  for (const name of CURSOR_API_KEY_ENV_NAMES) {
    const v = process.env[name]?.trim();
    if (v && isPlausibleCursorApiKey(v)) out.push({ name, length: v.length });
  }
  return out;
}

export function resolveCursorApiKey(): string | undefined {
  loadRuntimeEnv();
  for (const name of CURSOR_API_KEY_ENV_NAMES) {
    const v = process.env[name]?.trim();
    if (v && isPlausibleCursorApiKey(v)) return v;
  }
  return undefined;
}

/** Probe Cursor API; returns HTTP status or 0 on network failure. */
export async function probeCursorApiKey(key: string): Promise<{ status: number; ok: boolean }> {
  const auth = Buffer.from(`${key.trim()}:`).toString("base64");
  try {
    const res = await fetch("https://api.cursor.com/v1/me", {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });
    return { status: res.status, ok: res.status === 200 };
  } catch {
    return { status: 0, ok: false };
  }
}

/**
 * Cursor SDK model id for Auto routing.
 * `default` is the API id for Cursor **Auto** (dynamic model pick).
 */
export const CURSOR_MODEL_AUTO_ID = "default";

/** Normalize user-facing aliases to the SDK Auto model id. */
export function normalizeCursorModelId(raw: string | undefined): string {
  const v = raw?.trim();
  if (!v) return CURSOR_MODEL_AUTO_ID;
  const lower = v.toLowerCase();
  if (lower === "auto" || lower === "default") return CURSOR_MODEL_AUTO_ID;
  return v;
}

/** SDK model id; unset/`auto`/`default` → Cursor Auto. */
export function resolveCursorModelId(): string {
  loadRuntimeEnv();
  return normalizeCursorModelId(process.env.CURSOR_MODEL);
}
