import { spawn } from "node:child_process";
import path from "node:path";
import { trackManagedSubprocess } from "../swarm/managed-subprocess.js";

/** Programmatic gap registry refresh (no LLM) — non-blocking for async-swarm event loop. */
export async function runSwarmGapIngestTick(): Promise<{ ok: boolean; detail: string }> {
  if (process.env.LI_SWARM_GAP_INGEST_DISABLE === "1") {
    return { ok: true, detail: "disabled" };
  }

  const licRoot = process.env.LIC_ROOT?.trim();
  if (!licRoot) {
    return { ok: true, detail: "no LIC_ROOT" };
  }

  const script = path.join(licRoot, "scripts", "swarm-gap-ingest.py");
  const timeoutMs = Number(process.env.LI_SWARM_GAP_INGEST_TIMEOUT_MS ?? 60_000);

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn("python3", [script], {
        cwd: licRoot,
        env: {
          ...process.env,
          LIC_ROOT: licRoot,
          LI_LANGVERSE_ROOT: process.env.LI_LANGVERSE_ROOT ?? path.dirname(licRoot),
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
      trackManagedSubprocess(child);

      let tail = "";
      const append = (chunk: Buffer | string) => {
        tail = `${tail}${String(chunk)}`.slice(-400);
      };
      child.stdout?.on("data", append);
      child.stderr?.on("data", append);

      const timer = setTimeout(() => {
        try {
          child.kill("SIGTERM");
        } catch {
          /* */
        }
        reject(new Error(`swarm-gap-ingest timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(0);
        else reject(new Error(tail.trim() || `exit ${code ?? 1}`));
      });
    });
    if (exitCode !== 0) {
      return { ok: false, detail: `exit ${exitCode}` };
    }
    return { ok: true, detail: "ok" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg };
  }
}
