#!/usr/bin/env node
/**
 * Compare sequential vs parallel SDK matrix runs (wall clock + per-agent).
 *
 * Reads:
 *   logs/sdk-matrix/timing-sequential.jsonl
 *   logs/sdk-matrix-parallel/timing-parallel.jsonl
 *   logs/sdk-matrix/wall-summary.json (optional)
 *   logs/sdk-matrix-parallel/wall-summary.json (optional)
 *   or parses <<< DONE lines from all.log files
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readWallSummary(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function parseDoneFromLog(path) {
  if (!existsSync(path)) return [];
  const rows = [];
  const re = /<<< DONE (\S+) status=(\S+) (\d+)s/g;
  const text = readFileSync(path, "utf8");
  let m;
  while ((m = re.exec(text)) !== null) {
    rows.push({ agent: m[1], status: m[2], seconds: Number(m[3]) });
  }
  return rows;
}

function byAgent(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!r.agent) continue;
    map.set(r.agent, r);
  }
  return map;
}

const seqJsonl = readJsonl(join(root, "logs/sdk-matrix/timing-sequential.jsonl"));
const parJsonl = readJsonl(join(root, "logs/sdk-matrix-parallel/timing-parallel.jsonl"));
const seqWall = readWallSummary(join(root, "logs/sdk-matrix/wall-summary.json"));
const parWall = readWallSummary(join(root, "logs/sdk-matrix-parallel/wall-summary.json"));

const seqAgents =
  seqJsonl.length > 0
    ? byAgent(seqJsonl)
    : byAgent(parseDoneFromLog(join(root, "logs/sdk-matrix/all.log")));
const parAgents =
  parJsonl.length > 0
    ? byAgent(parJsonl)
    : byAgent(parseDoneFromLog(join(root, "logs/sdk-matrix-parallel/all.log")));

const allAgents = [...new Set([...seqAgents.keys(), ...parAgents.keys()])].sort();

if (!allAgents.length) {
  console.error("No timing data found. Run:");
  console.error("  npm run test:verify-all-agents-sdk-stream      # sequential");
  console.error("  npm run test:verify-all-agents-sdk-parallel    # parallel");
  process.exit(1);
}

function fmtSec(s) {
  if (s == null || Number.isNaN(s)) return "—";
  return `${s}s`;
}

function sumSeconds(map) {
  let n = 0;
  for (const r of map.values()) n += Number(r.seconds) || 0;
  return n;
}

const seqSum = sumSeconds(seqAgents);
const parSum = sumSeconds(parAgents);

console.log("\nSDK matrix timing comparison\n");
if (seqWall?.wall_seconds != null || parWall?.wall_seconds != null) {
  console.log("Wall clock (script):");
  if (seqWall?.wall_seconds != null) {
    console.log(`  sequential: ${fmtSec(seqWall.wall_seconds)} (${seqWall.agents ?? "?"} agents)`);
  }
  if (parWall?.wall_seconds != null) {
    console.log(
      `  parallel:   ${fmtSec(parWall.wall_seconds)} (${parWall.agents ?? "?"} agents, max_concurrent=${parWall.sdk_max_concurrent ?? "?"})`,
    );
  }
  if (seqWall?.wall_seconds && parWall?.wall_seconds) {
    const pct = Math.round((1 - parWall.wall_seconds / seqWall.wall_seconds) * 100);
    console.log(`  speedup:    ${pct > 0 ? `${pct}% faster parallel` : `${-pct}% slower parallel`}`);
  }
  console.log("");
}

console.log("Sum of per-agent SDK durations (overlaps in parallel — not wall clock):");
console.log(`  sequential Σ: ${fmtSec(Math.round(seqSum))}`);
console.log(`  parallel Σ:   ${fmtSec(Math.round(parSum))}`);
console.log("");

console.log("Per agent:");
console.log("agent".padEnd(28) + "sequential".padEnd(14) + "parallel".padEnd(14) + "notes");
console.log("-".repeat(70));
for (const agent of allAgents) {
  const s = seqAgents.get(agent);
  const p = parAgents.get(agent);
  const note = [];
  if (s?.status && s.status !== "ok") note.push(`seq:${s.status}`);
  if (p?.status && p.status !== "finished" && p.status !== "ok") note.push(`par:${p.status}`);
  console.log(
    agent.padEnd(28) +
      fmtSec(s?.seconds).padEnd(14) +
      fmtSec(p?.seconds).padEnd(14) +
      (note.join(" ") || ""),
  );
}
console.log("");
