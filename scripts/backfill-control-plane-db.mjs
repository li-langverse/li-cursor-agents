#!/usr/bin/env node
/**
 * Backfill local Supabase from data/control-plane/ and data/runs/.
 * Requires: supabase start, supabase db reset (or migrations applied), env vars set.
 *
 *   export SUPABASE_URL=http://127.0.0.1:54321
 *   npm run db:ensure   # writes .env.supabase with keys
 *   set -a && source .env.supabase && set +a
 *   node scripts/backfill-control-plane-db.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = process.env.LI_CURSOR_AGENTS_DATA ?? join(root, "data");
const runsDir = join(dataRoot, "runs");
const cpDir = join(dataRoot, "control-plane");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function parseRunId(mdFile) {
  return mdFile.replace(/\.md$/, "");
}

async function backfillRuns() {
  if (!existsSync(runsDir)) {
    console.log("No runs dir:", runsDir);
    return 0;
  }
  const mds = readdirSync(runsDir).filter((f) => f.endsWith(".md"));
  let n = 0;
  for (const md of mds) {
    const runId = parseRunId(md);
    const jsonPath = join(runsDir, `${runId}.json`);
    let meta = {};
    if (existsSync(jsonPath)) {
      try {
        meta = JSON.parse(readFileSync(jsonPath, "utf8"));
      } catch {
        /* skip */
      }
    }
    const tsMatch = /-(\d+)\.md$/.exec(md);
    const startedAt = tsMatch
      ? new Date(Number(tsMatch[1])).toISOString()
      : new Date().toISOString();
    const outputMd = readFileSync(join(runsDir, md), "utf8");
    const completion = meta.completion ?? null;
    const prUrls = completion?.pr_urls ?? [];

    const { error } = await supabase.from("agent_runs").upsert(
      {
        run_id: runId,
        agent_id: meta.agentId ?? runId.split("-")[0],
        started_at: startedAt,
        finished_at: startedAt,
        status: meta.status ?? "finished",
        backend: meta.backend ?? null,
        briefing_hash: meta.briefing_hash ?? null,
        reason: meta.reason ?? null,
        fingerprint: meta.fingerprint ?? null,
        duration_ms: meta.durationMs ?? null,
        output_md: outputMd,
        output_path: join(runsDir, md),
        error: meta.error ?? null,
        completion,
        pr_urls: prUrls,
        meta: {},
      },
      { onConflict: "run_id" },
    );
    if (error) {
      console.error("run", runId, error.message);
    } else {
      n += 1;
    }
  }
  return n;
}

async function backfillControlPlane() {
  const statePath = join(cpDir, "state.json");
  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    const { error } = await supabase
      .from("control_plane_state")
      .upsert({ id: 1, version: state.version ?? 1, payload: state });
    if (error) console.error("state", error.message);
    else console.log("state.json → control_plane_state");
  }

  const reportPath = join(cpDir, "latest-report.json");
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    await supabase.from("control_plane_reports").update({ is_latest: false }).eq("is_latest", true);
    const { error } = await supabase.from("control_plane_reports").insert({
      generated_at: report.generated_at,
      briefing_hash: report.briefing_hash,
      payload: report,
      is_latest: true,
    });
    if (error) console.error("report", error.message);
    else console.log("latest-report.json → control_plane_reports");

    if (report.briefing_hash && report.preflight?.briefing) {
      await supabase.from("briefing_snapshots").upsert({
        briefing_hash: report.briefing_hash,
        generated_at: report.briefing_generated_at ?? report.generated_at,
        source_path: report.preflight.briefing_path ?? null,
        payload: report.preflight.briefing,
      });
    }
    if (report.heap_plan) {
      await supabase.from("heap_plan_snapshots").upsert({
        briefing_hash: report.briefing_hash,
        generated_at: report.generated_at,
        payload: report.heap_plan,
      });
    }
  }

  const ivPath = join(cpDir, "interventions.json");
  if (existsSync(ivPath)) {
    const raw = JSON.parse(readFileSync(ivPath, "utf8"));
    const items = raw.interventions ?? raw.items ?? [];
    const { error } = await supabase.from("interventions_snapshots").insert({
      generated_at: raw.generated_at ?? new Date().toISOString(),
      briefing_hash: raw.briefing_hash ?? null,
      items,
    });
    if (error) console.error("interventions", error.message);
    else console.log("interventions.json → interventions_snapshots");
  }
}

const runCount = await backfillRuns();
console.log(`Backfilled ${runCount} agent_runs`);
await backfillControlPlane();
console.log("Done.");
