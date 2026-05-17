#!/usr/bin/env node
/** Smoke-test control-plane DB read path and MCP SQL validator. */
import { loadRuntimeEnv } from "../env.js";
import { dbEnabled } from "../db/client.js";
import { probeSupabaseRest } from "../db/rest-health.js";
import { schemaMarkdown } from "../db/schema-catalog.js";
import { runReadOnlyQuery } from "../db/read-query.js";

loadRuntimeEnv();

async function main(): Promise<void> {
  console.log(schemaMarkdown());
  console.log("");

  if (!dbEnabled()) {
    console.log("SKIP: Supabase store not configured (LI_CONTROL_PLANE_STORE=disk or missing SUPABASE_URL)");
    process.exit(0);
  }

  const rest = await probeSupabaseRest();
  console.log(`REST (PostgREST @ ${process.env.SUPABASE_URL}): ${rest.ok ? "OK" : `FAIL — ${rest.error}`}`);
  console.log("");
  if (!rest.ok) {
    console.error("Fix: npm run db:ensure — REST must be up (port 54321), not only Postgres 54322.");
    process.exit(1);
  }

  const queries = [
    "SELECT count(*)::int AS agent_runs FROM agent_runs",
    "SELECT run_id, agent_id, status, started_at FROM agent_runs ORDER BY started_at DESC LIMIT 3",
  ];

  let failed = 0;
  for (const sql of queries) {
    console.log(`--- ${sql}`);
    const r = await runReadOnlyQuery(sql);
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) failed++;
    console.log("");
  }

  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
