#!/usr/bin/env node
/**
 * Live SDK matrix: every leaf agent must finish with substantive output (no repo pushes).
 *
 *   npm run build
 *   npm run verify:agents:live
 *
 * Env: CURSOR_API_KEY, BENCHMARKS_ROOT (default: parent benchmarks checkout)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadRuntimeEnv } from "../dist/env.js";
import { resolveCursorApiKey } from "../dist/env.js";
import { AGENT_REGISTRY } from "../dist/agents/registry.js";
import { resolveBenchmarksRoot } from "../dist/preflight.js";
import { runAgent } from "../dist/runner.js";

loadRuntimeEnv();

const LEAVES = AGENT_REGISTRY.filter((a) => a.id !== "orchestrator");
const benchmarksRoot = resolveBenchmarksRoot(process.env.BENCHMARKS_ROOT);
const reportPath =
  process.env.LI_AGENT_VERIFY_REPORT ||
  join(process.cwd(), "logs", "agent-matrix-live-report.json");

const VERIFY_INSTRUCTION =
  "AGENT MATRIX LIVE VERIFY: Use only preflight/briefing data and your workspace (read-only). " +
  "Produce: (1) Executive summary with at least 3 bullets citing real repo or audit names, " +
  "(2) Deliverable/findings table or section with concrete paths or PR numbers from preflight, " +
  "(3) Deferred with at least 2 items. Do NOT edit files, commit, push, or open PRs. " +
  "Stop when the digest is complete (under 500 words).";

function meaningful(result) {
  const text = [
    result.outputText,
    result.trace?.assistant_text,
    result.error,
  ]
    .filter(Boolean)
    .join("\n");
  const len = text.replace(/\s+/g, " ").trim().length;
  const bad =
    /AuthenticationError|invalid.*api.*key|401\b|quota exceeded|rate limit/i.test(text) ||
    (result.status === "error" && len < 80);
  const okStatus = result.status === "finished" || result.status === "incomplete";
  const substantive =
    len >= 280 ||
    (result.completion?.evidence?.length && result.completion.evidence.length >= 1);
  const hasStructure =
    /executive|summary|deliverable|deferred|finding|preflight|briefing/i.test(text);
  return {
    ok: okStatus && substantive && hasStructure && !bad,
    len,
    hasStructure,
    bad,
    status: result.status,
    premature: result.completion?.premature,
    complete: result.completion?.complete,
  };
}

async function main() {
  if (!resolveCursorApiKey()) {
    console.error("FAIL: no Cursor API key");
    process.exit(1);
  }
  if (!benchmarksRoot) {
    console.error("FAIL: BENCHMARKS_ROOT / benchmarks scripts not found");
    process.exit(1);
  }

  process.env.BENCHMARKS_ROOT = benchmarksRoot;
  process.env.LI_REPO_WORKFLOW_SKIP_PUSH = "1";
  process.env.LI_REPO_WORKFLOW_USE_FIXTURE = "1";
  process.env.LI_WORKSPACE_SWEEP_FORCE_LLM = "0";

  mkdirSync(join(process.cwd(), "logs"), { recursive: true });

  const rows = [];
  let failed = 0;

  console.log(`Verifying ${LEAVES.length} leaf agents (live SDK, skip push, li-demo fixture)…`);
  console.log(`Benchmarks: ${benchmarksRoot}\n`);

  for (const def of LEAVES) {
    const t0 = Date.now();
    process.stdout.write(`  ${def.id} … `);
    let result;
    try {
      result = await runAgent({
        agentId: def.id,
        benchmarksRoot,
        mock: false,
        dryRun: false,
        extraInstruction: VERIFY_INSTRUCTION,
      });
    } catch (err) {
      result = {
        agentId: def.id,
        backend: "cursor-sdk",
        status: "error",
        durationMs: Date.now() - t0,
        outputText: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
    const check = meaningful(result);
    const row = {
      agent_id: def.id,
      category: def.category,
      status: result.status,
      duration_ms: result.durationMs,
      meaningful: check.ok,
      output_chars: check.len,
      has_structure: check.hasStructure,
      premature: result.completion?.premature,
      complete: result.completion?.complete,
      error: result.error?.slice(0, 200),
      output_path: result.outputPath,
    };
    rows.push(row);
    if (!check.ok) failed += 1;
    console.log(check.ok ? "OK" : "FAIL", `(${result.status}, ${check.len} chars, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  const report = {
    generated_at: new Date().toISOString(),
    benchmarks_root: benchmarksRoot,
    agents_total: LEAVES.length,
    agents_ok: LEAVES.length - failed,
    agents_failed: failed,
    rows,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${reportPath}`);
  console.log(`Summary: ${report.agents_ok}/${report.agents_total} meaningful`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
