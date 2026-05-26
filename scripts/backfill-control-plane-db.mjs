#!/usr/bin/env node
/**
 * Backfill control-plane from data/control-plane/ and data/runs/.
 *
 * Supabase (default):
 *   export SUPABASE_URL=http://127.0.0.1:54321
 *   npm run db:ensure && set -a && source .env.supabase && set +a
 *   node scripts/backfill-control-plane-db.mjs
 *
 * lidb (PH-DB-10 — requires lidb_embed + LI_LIDB_REPO):
 *   export LI_CONTROL_PLANE_STORE=lidb LI_LIDB_REPO=../lidb
 *   export LIDB_DATA_DIR=./.li-data
 *   node scripts/backfill-control-plane-db.mjs --store=lidb
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = process.env.LI_CURSOR_AGENTS_DATA ?? join(root, "data");
const runsDir = join(dataRoot, "runs");
const cpDir = join(dataRoot, "control-plane");

const store =
  process.argv.includes("--store=lidb") || process.env.LI_CONTROL_PLANE_STORE === "lidb"
    ? "lidb"
    : "supabase";

function runLidbBridge(command, ...args) {
  const script = join(root, "scripts", "lidb-liorm-bridge.py");
  const proc = spawnSync("python3", [script, command, ...args], {
    env: {
      ...process.env,
      LI_LIDB_REPO: process.env.LI_LIDB_REPO ?? join(root, "..", "lidb"),
      LIDB_DATA_DIR: process.env.LIDB_DATA_DIR ?? process.env.LI_DATA_DIR ?? join(root, ".li-data"),
    },
    encoding: "utf8",
  });
  const line = (proc.stdout ?? "").trim().split("\n").pop() ?? "{}";
  try {
    return JSON.parse(line);
  } catch {
    return { ok: false, error: proc.stderr || proc.stdout || `exit ${proc.status}` };
  }
}

let supabase = null;
if (store === "supabase") {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --store=lidb)");
    process.exit(1);
  }
  supabase = createClient(url, key, { auth: { persistSession: false } });
} else {
  const probe = runLidbBridge("probe");
  if (!probe.engine) {
    console.error("lidb engine not ready — build lidb_embed and set LI_LIDB_REPO / LIDB_DATA_DIR");
    process.exit(1);
  }
  console.log("Backfill target: lidb (liorm bridge)");
}

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

    if (store === "lidb") {
      const result = runLidbBridge(
        "upsert_agent_run",
        JSON.stringify({
          run_id: runId,
          agent_id: meta.agentId ?? runId.split("-")[0],
          started_at: startedAt,
          finished_at: startedAt,
          status: meta.status ?? "finished",
          briefing_hash: meta.briefing_hash ?? null,
          output_md: outputMd,
        }),
      );
      if (!result.ok) console.error("run", runId, result.error);
      else n += 1;
    } else {
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
  }
  return n;
}

async function backfillControlPlane() {
  const statePath = join(cpDir, "state.json");
  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (store === "lidb") {
      const result = runLidbBridge("upsert_control_plane_state", JSON.stringify(state));
      if (!result.ok) console.error("state", result.error);
      else console.log("state.json → control_plane_state (lidb)");
    } else {
      const { error } = await supabase
        .from("control_plane_state")
        .upsert({ id: 1, version: state.version ?? 1, payload: state });
      if (error) console.error("state", error.message);
      else console.log("state.json → control_plane_state");
    }
  }

  if (store === "lidb") {
    console.log("lidb backfill: reports/interventions skipped until native catalog parity (see docs/plans/schema-parity-control-plane-db-r0-4.md)");
    return;
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
