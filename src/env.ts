import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

/** Cursor + local .env + GitHub (for dashboard / supervisor / agent children). */
export function loadRuntimeEnv(): void {
  loadDotEnv();
  loadGithubEnv();
  // gh accepts either name; keep both in sync when only GH_TOKEN is set
  if (process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    process.env.GITHUB_TOKEN = process.env.GH_TOKEN;
  }
}

export function resolveCursorApiKey(): string | undefined {
  loadRuntimeEnv();
  const candidates = [
    "CURSOR_API_KEY",
    "CURSOR_SDK_KEY",
    "CURSOR_SDK",
    "CURSOR_API_TOKEN",
  ];
  for (const name of candidates) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return undefined;
}

/** SDK model id; `default` is Cursor "Auto" (`Cursor.models.list` displayName). */
export function resolveCursorModelId(): string {
  loadRuntimeEnv();
  const v = process.env.CURSOR_MODEL?.trim();
  return v || "default";
}
