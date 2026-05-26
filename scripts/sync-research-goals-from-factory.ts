#!/usr/bin/env node
/**
 * Emit config/research-goals.yaml from the researcher factory.
 * Run: npm run research-goals:sync
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distCli = join(root, "dist", "cli", "sync-research-goals-from-factory.js");

if (!existsSync(distCli)) {
  const build = spawnSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const run = spawnSync(process.execPath, [distCli, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: root,
});
process.exit(run.status ?? 1);
