import { runCmd } from "./git.js";

/** Active branch in clone (after agent may have checked out a tracking branch). */
export function gitCurrentBranch(cloneDir: string, dryRun = false): string | undefined {
  const r = runCmd("git", ["rev-parse", "--abbrev-ref", "HEAD"], cloneDir, dryRun);
  if (!r.ok || !r.stdout || r.stdout === "HEAD") return undefined;
  return r.stdout;
}
