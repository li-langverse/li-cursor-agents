import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { agentsPackageRoot } from "./package-root.js";

/** Pull siblings + sync skills if interval elapsed (bash: maybe-sync-ecosystem.sh). */
export function maybeSyncEcosystem(extraArgs: string[] = ["--quick"]): void {
  if (process.env.LI_ECOSYSTEM_AUTO_SYNC === "0") return;
  const root = agentsPackageRoot();
  const script = join(root, "scripts", "maybe-sync-ecosystem.sh");
  const r = spawnSync("bash", [script, ...extraArgs], {
    cwd: root,
    stdio: "pipe",
    timeout: Number(process.env.LI_ECOSYSTEM_SYNC_TIMEOUT_MS ?? 300_000),
    encoding: "utf8",
  });
  if (r.status !== 0 && r.status !== null) {
    const err = (r.stderr || r.stdout || "").trim().slice(0, 500);
    console.warn(`[ecosystem-sync] maybe-sync exited ${r.status}: ${err}`);
  }
}
