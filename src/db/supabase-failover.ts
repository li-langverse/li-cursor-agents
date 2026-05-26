import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agentLog } from "../agent-log.js";
import { resetSupabaseClient } from "./client.js";

export type SupabaseFailoverEndpoint = "primary" | "standby" | "none";

const PROBE_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "LI_SUPABASE_ACTIVE_ENDPOINT",
] as const;

let probeTimer: ReturnType<typeof setInterval> | null = null;
let lastEndpoint: SupabaseFailoverEndpoint | null = null;

export function supabaseFailoverEnabled(): boolean {
  return process.env.LI_SUPABASE_FAILOVER === "1";
}

export function activeSupabaseEndpoint(): SupabaseFailoverEndpoint {
  const raw = process.env.LI_SUPABASE_ACTIVE_ENDPOINT?.trim().toLowerCase();
  if (raw === "primary" || raw === "standby") return raw;
  return "none";
}

export function parseSupabaseProbeStdout(stdout: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    if (!PROBE_ENV_KEYS.includes(key as (typeof PROBE_ENV_KEYS)[number])) continue;
    out[key] = t.slice(eq + 1);
  }
  return out;
}

function packageRootFromModule(): string {
  const env = process.env.LI_CURSOR_AGENTS_ROOT?.trim();
  if (env && existsSync(join(env, "package.json"))) return env;
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "../..");
}

/** Run scripts/supabase-health-probe.sh (bash + curl). */
export function runSupabaseHealthProbeScript(root?: string): {
  ok: boolean;
  vars: Record<string, string>;
} {
  const pkg = root ?? packageRootFromModule();
  const script = join(pkg, "scripts/supabase-health-probe.sh");
  if (!existsSync(script)) {
    return { ok: false, vars: {} };
  }
  const r = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      LI_SUPABASE_PROBE_QUIET: "1",
      LI_SUPABASE_ENSURE_QUIET: "1",
    },
    timeout: 45_000,
  });
  const stdout = `${r.stdout ?? ""}`.trim();
  const vars = parseSupabaseProbeStdout(stdout);
  const endpoint = vars.LI_SUPABASE_ACTIVE_ENDPOINT as SupabaseFailoverEndpoint | undefined;
  const ok = r.status === 0 && Boolean(vars.SUPABASE_URL && endpoint);
  return { ok, vars };
}

function applyProbeVars(vars: Record<string, string>): SupabaseFailoverEndpoint {
  for (const key of PROBE_ENV_KEYS) {
    const v = vars[key];
    if (v) process.env[key] = v;
  }
  const endpoint = activeSupabaseEndpoint();
  if (endpoint !== "none" && endpoint !== lastEndpoint) {
    resetSupabaseClient();
    agentLog("supabase-failover", "info", `active endpoint=${endpoint} url=${process.env.SUPABASE_URL ?? "?"}`);
    lastEndpoint = endpoint;
  }
  return endpoint;
}

/**
 * Probe primary → standby; when failover is enabled, export winning credentials.
 * Returns false when both endpoints fail (caller may fall back to disk store).
 */
export function applySupabaseFailoverAtBoot(root?: string): boolean {
  if (!supabaseFailoverEnabled()) return false;
  const { ok, vars } = runSupabaseHealthProbeScript(root);
  if (!ok) return false;
  applyProbeVars(vars);
  return activeSupabaseEndpoint() !== "none";
}

/** Periodic re-probe (default 60s) for runtime primary→standby switch within ~90s. */
export function startSupabaseFailoverProbeLoop(intervalMs?: number): void {
  if (!supabaseFailoverEnabled()) return;
  if (probeTimer) return;
  const ms = intervalMs ?? Number(process.env.LI_SUPABASE_FAILOVER_PROBE_MS ?? 60_000);
  const interval = Number.isFinite(ms) && ms >= 15_000 ? ms : 60_000;
  const tick = () => {
    const prev = activeSupabaseEndpoint();
    const { ok, vars } = runSupabaseHealthProbeScript();
    if (ok) {
      applyProbeVars(vars);
      return;
    }
    if (prev !== "none") {
      agentLog("supabase-failover", "warn", "primary and standby unreachable");
      lastEndpoint = "none";
      delete process.env.LI_SUPABASE_ACTIVE_ENDPOINT;
      resetSupabaseClient();
    }
  };
  void tick();
  probeTimer = setInterval(() => void tick(), interval);
  probeTimer.unref?.();
}

export function stopSupabaseFailoverProbeLoop(): void {
  if (probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
}

/** Fields for swarm-health.json when failover is enabled. */
export function supabaseFailoverHealthFields(): {
  store: "supabase" | "disk";
  supabase_endpoint: SupabaseFailoverEndpoint;
} {
  if (!supabaseFailoverEnabled()) {
    return { store: "supabase", supabase_endpoint: "none" };
  }
  const endpoint = activeSupabaseEndpoint();
  const store =
    process.env.LI_CONTROL_PLANE_STORE === "disk" || process.env.LI_STACK_SKIP_SUPABASE === "1"
      ? "disk"
      : endpoint === "none" && !process.env.SUPABASE_URL
        ? "disk"
        : "supabase";
  return { store, supabase_endpoint: endpoint };
}
