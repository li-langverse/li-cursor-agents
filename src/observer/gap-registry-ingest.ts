import { spawnSync } from "node:child_process";
import path from "node:path";

/** Programmatic gap registry refresh (no LLM) — called on supervisor observer ticks. */
export function runSwarmGapIngestTick(): { ok: boolean; detail: string } {
  if (process.env.LI_SWARM_GAP_INGEST_DISABLE === "1") {
    return { ok: true, detail: "disabled" };
  }

  const licRoot = process.env.LIC_ROOT?.trim();
  if (!licRoot) {
    return { ok: true, detail: "no LIC_ROOT" };
  }

  const script = path.join(licRoot, "scripts", "swarm-gap-ingest.py");
  const proc = spawnSync("python3", [script], {
    cwd: licRoot,
    env: {
      ...process.env,
      LIC_ROOT: licRoot,
      LI_LANGVERSE_ROOT: process.env.LI_LANGVERSE_ROOT ?? path.dirname(licRoot),
    },
    encoding: "utf-8",
    timeout: Number(process.env.LI_SWARM_GAP_INGEST_TIMEOUT_MS ?? 120_000),
  });

  const tail = `${proc.stdout ?? ""}${proc.stderr ?? ""}`.slice(-400);
  if (proc.error) {
    return { ok: false, detail: proc.error.message };
  }
  if (proc.status !== 0) {
    return { ok: false, detail: tail || `exit ${proc.status}` };
  }
  return { ok: true, detail: tail.trim() || "ok" };
}
