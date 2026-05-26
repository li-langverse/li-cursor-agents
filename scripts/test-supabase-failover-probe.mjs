#!/usr/bin/env node
/**
 * Dry-run supabase-health-probe (no curl when LI_SUPABASE_FAILOVER_DRY_RUN=1).
 * Usage: node scripts/test-supabase-failover-probe.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "li-supabase-probe-"));

writeFileSync(
  join(tmp, ".env.supabase"),
  [
    "SUPABASE_URL=http://127.0.0.1:54321",
    "SUPABASE_ANON_KEY=dry-anon",
    "SUPABASE_SERVICE_ROLE_KEY=dry-sr",
    "SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  ].join("\n") + "\n",
);

const r = spawnSync("bash", [join(root, "scripts/supabase-health-probe.sh")], {
  encoding: "utf8",
  env: {
    ...process.env,
    LI_SUPABASE_PROBE_ROOT: tmp,
    LI_SUPABASE_FAILOVER_DRY_RUN: "1",
    LI_SUPABASE_PROBE_QUIET: "1",
  },
});

const out = (r.stdout ?? "").trim();
const endpoint = out.split("\n").find((l) => l.startsWith("LI_SUPABASE_ACTIVE_ENDPOINT="));
if (r.status !== 0 || !endpoint?.includes("primary")) {
  console.error("probe dry-run failed", { status: r.status, stdout: out, stderr: r.stderr });
  process.exit(1);
}
if (out.includes("dry-sr") && process.env.CI === "1") {
  // ok — keys only on stdout for sourcing, not logged by probe stderr
}
console.log("ok: supabase-health-probe dry-run → primary");
process.exit(0);
