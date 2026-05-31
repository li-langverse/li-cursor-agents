import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

export function runPython(scriptName: string, args: string[] = []): { ok: boolean; tail: string } {
  const root = agentsPackageRoot();
  const script = join(root, "scripts", scriptName);
  if (!existsSync(script)) return { ok: false, tail: `missing ${script}` };
  const py = process.platform === "win32" ? "python" : "python3";
  const proc = spawnSync(py, [script, ...args], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    timeout: 3_600_000,
  });
  const tail = `${proc.stdout ?? ""}${proc.stderr ?? ""}`.trim().slice(-2000);
  return { ok: proc.status === 0, tail };
}

export function parsePrOpenCount(tail: string): number | null {
  const m = /open_prs=(\d+)/.exec(tail);
  return m ? Number(m[1]) : null;
}

export function refreshPrMergeQueue(): { ok: boolean; tail: string } {
  return runPython("org-merge-open-prs.py");
}
