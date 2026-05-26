/**
 * PH-DB-10: subprocess bridge to lidb Python liorm/liq.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type LidbBridgeResult = {
  ok: boolean;
  engine?: boolean;
  rows?: Record<string, unknown>[];
  row_count?: number;
  error?: string;
  run_id?: string;
};

const moduleDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(moduleDir, "..", "..");

let probeCache: { at: number; result: LidbBridgeResult } | null = null;
const PROBE_TTL_MS = 30_000;

function bridgeScriptPath(): string {
  return join(packageRoot, "scripts", "lidb-liorm-bridge.py");
}

function resolveLidbRepo(): string {
  const fromEnv = process.env.LI_LIDB_REPO?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const sibling = join(packageRoot, "..", "lidb");
  if (existsSync(sibling)) return sibling;
  return fromEnv ?? sibling;
}

/** Directory passed to LIDB_DATA_DIR for embedded engine. */
function lidbUrlAsDataDir(): string | undefined {
  const url = process.env.LI_LIDB_URL?.trim();
  if (!url?.startsWith("file:")) return undefined;
  try {
    return fileURLToPath(url);
  } catch {
    return undefined;
  }
}

/** Directory passed to LIDB_DATA_DIR for embedded engine. */
export function resolveLidbDataDir(): string | undefined {
  return (
    process.env.LIDB_DATA_DIR?.trim() ||
    process.env.LI_DATA_DIR?.trim() ||
    lidbUrlAsDataDir()
  );
}

/** Non-file LI_LIDB_URL means “use engine” without embedding data dir in URL. */
export function lidbUrlImpliesEngine(): boolean {
  const url = process.env.LI_LIDB_URL?.trim();
  if (!url) return false;
  if (url.startsWith("file:")) return true;
  return url.startsWith("lidb:") || url.startsWith("http://") || url.startsWith("https://");
}

function bridgeEnv(): NodeJS.ProcessEnv {
  const dataDir = resolveLidbDataDir();
  return {
    ...process.env,
    LI_LIDB_REPO: resolveLidbRepo(),
    ...(dataDir ? { LIDB_DATA_DIR: dataDir, LI_DATA_DIR: dataDir } : {}),
  };
}

export function runLidbBridge(command: string, ...args: string[]): Promise<LidbBridgeResult> {
  const script = bridgeScriptPath();
  if (!existsSync(script)) {
    return Promise.resolve({ ok: false, error: `bridge script missing: ${script}` });
  }

  return new Promise((resolve) => {
    const proc = spawn("python3", [script, command, ...args], {
      env: bridgeEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      const line = stdout.trim().split("\n").pop() ?? "";
      try {
        const parsed = JSON.parse(line) as LidbBridgeResult;
        if (!parsed.ok && !parsed.error) {
          parsed.error = stderr.trim() || `bridge exit ${code}`;
        }
        resolve(parsed);
      } catch {
        resolve({
          ok: false,
          error: stderr.trim() || stdout.trim() || `bridge exit ${code}`,
        });
      }
    });
  });
}

/** True when native lidb_embed responds to probe (cached). */
export async function probeLidbEngine(): Promise<boolean> {
  const now = Date.now();
  if (probeCache && now - probeCache.at < PROBE_TTL_MS) {
    return Boolean(probeCache.result.ok && probeCache.result.engine);
  }
  const result = await runLidbBridge("probe");
  probeCache = { at: now, result };
  return Boolean(result.ok && result.engine);
}

export function clearLidbProbeCache(): void {
  probeCache = null;
}

/** Prefer real liorm when mock is off and engine probe succeeds. */
export async function shouldUseLidbEngine(): Promise<boolean> {
  if (process.env.LI_LIDB_MOCK === "1") return false;
  if (lidbUrlImpliesEngine() || resolveLidbDataDir()) {
    return probeLidbEngine();
  }
  return false;
}
