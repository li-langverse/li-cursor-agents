import assert from "node:assert/strict";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AGENT_REGISTRY } from "../agents/registry.js";
import type { AgentRunTrace } from "../agent-run-trace.js";
import {
  NUMERICS_EVIDENCE_AGENT_IDS,
  REPO_WORKFLOW_AGENT_IDS,
  RESEARCH_HANDOFF_AGENT_IDS,
} from "../control-plane/run-completion.js";
import { handleDbApiRequest } from "../db-api/index.js";
import type { AgentRunResult } from "../types.js";
import { leafAgentIds } from "./helpers.js";

/** Every leaf agent (orchestrator excluded from matrix coverage). */
export const ALL_LEAF_AGENTS = AGENT_REGISTRY.filter((a) => a.id !== "orchestrator");

export function assertAllLeavesRegistered(): void {
  const ids = leafAgentIds();
  if (ALL_LEAF_AGENTS.length !== ids.length) {
    throw new Error(
      `leaf count mismatch: registry=${ALL_LEAF_AGENTS.length} leafAgentIds=${ids.length}`,
    );
  }
}

export async function dbGet(
  path: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const pathname = path.split("?")[0]!;
  const res = await handleDbApiRequest(new Request(`http://localhost${path}`), pathname);
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

export function reapplyE2eStore(env: {
  controlPlaneDir: string;
  runsDir: string;
  handoffsDir: string;
  researchSessionsDir: string;
}): void {
  process.env.LI_CONTROL_PLANE_DIR = env.controlPlaneDir;
  process.env.LI_RUNS_DIR = env.runsDir;
  process.env.LI_HANDOFFS_DIR = env.handoffsDir;
  process.env.LI_RESEARCH_SESSIONS_DIR = env.researchSessionsDir;
  if (process.env.LI_E2E_USE_SUPABASE !== "1") {
    process.env.LI_CONTROL_PLANE_STORE = "disk";
    process.env.LI_STACK_SKIP_SUPABASE = "1";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

export async function pollRunDetailUntil(
  runId: string,
  predicate: (body: Record<string, unknown>) => boolean,
  opts?: { maxMs?: number; intervalMs?: number },
): Promise<Record<string, unknown>> {
  const maxMs = opts?.maxMs ?? 2_000;
  const intervalMs = opts?.intervalMs ?? 25;
  const start = Date.now();
  let last: Record<string, unknown> = {};
  while (Date.now() - start < maxMs) {
    const { status, body } = await dbGet(`/api/runs/${encodeURIComponent(runId)}`);
    assertStatusOk(status, runId);
    last = body;
    if (predicate(body)) return body;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

function assertStatusOk(status: number, runId: string): void {
  if (status !== 200) {
    throw new Error(`GET /api/runs/${runId} → ${status}`);
  }
}

/** Finest-grain SDK stream visible in run_trace (onDelta / onStep collector). */
export function traceHasLiveStream(trace?: AgentRunTrace | null): boolean {
  if (!trace) return false;
  if ((trace.deltas?.length ?? 0) > 0) return true;
  if (trace.thinking_text?.trim()) return true;
  if (trace.assistant_text?.trim()) return true;
  if ((trace.steps?.length ?? 0) > 0) return true;
  return false;
}

export function runDetailHasLiveStream(body: Record<string, unknown>): boolean {
  return traceHasLiveStream(body.run_trace as AgentRunTrace | undefined);
}

/** Poll in-process + db-api until live stream appears (same Node process as worker). */
export async function pollUntilLiveStreamVisible(
  agentId: string,
  opts?: { maxMs?: number; intervalMs?: number },
): Promise<{ runId: string; fromMemory: boolean; detail?: Record<string, unknown> }> {
  const maxMs = opts?.maxMs ?? 180_000;
  const intervalMs = opts?.intervalMs ?? 400;
  const { listActiveRuns } = await import("../control-plane/runtime.js");
  const start = Date.now();

  while (Date.now() - start < maxMs) {
    const running = listActiveRuns().filter(
      (r) => r.agent_id === agentId && r.status === "running",
    );
    if (running.length > 0) {
      const runId = running[0]!.run_id;
      if (traceHasLiveStream(running[0]!.run_trace)) {
        return { runId, fromMemory: true };
      }
      try {
        const detail = await pollRunDetailUntil(
          runId,
          (b) => b.live === true && runDetailHasLiveStream(b),
          { maxMs: Math.min(3_000, maxMs - (Date.now() - start)), intervalMs: 80 },
        );
        if (runDetailHasLiveStream(detail)) {
          return { runId, fromMemory: false, detail };
        }
      } catch {
        /* run detail not ready */
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `timed out after ${maxMs}ms waiting for live SDK stream on agent ${agentId}`,
  );
}

/** Prompt that passes completion audit (length, deliverable checklist, role-specific skips). */
export function sdkMatrixExtraInstruction(agentId: string): string {
  const lines = [
    "SDK matrix smoke test — read-only. Do not open PRs, commit, push, or edit repository files.",
    "Line 1 of your reply MUST start with OK-.",
    "Write at least 150 words: one paragraph on what this agent does in the li-langverse swarm.",
    "End with this exact section (keep the checked box):",
    "## Agent deliverable",
    "- [x] SDK matrix smoke completed",
  ];
  if (REPO_WORKFLOW_AGENT_IDS.has(agentId)) {
    lines.push("State clearly: no changes needed for this smoke test (no PR).");
  }
  if (NUMERICS_EVIDENCE_AGENT_IDS.has(agentId)) {
    lines.push(
      "Name a real evidence path you would use in production, e.g. li-tests/manifest.toml or benchmarks/.",
    );
  }
  if (RESEARCH_HANDOFF_AGENT_IDS.has(agentId)) {
    lines.push(
      "If you mention handoff, include north_star_fit: domain=smoke-test pillar=verification.",
    );
  }
  return lines.join("\n");
}

/** Append per-agent timing for sequential vs parallel matrix comparison. */
export function recordSdkMatrixTiming(
  agentId: string,
  status: string,
  seconds: number,
): void {
  const mode = process.env.LI_SDK_MATRIX_MODE?.trim() || "batch";
  const file =
    process.env.LI_SDK_MATRIX_TIMING_FILE?.trim() ||
    join(sdkMatrixLogDir(), `timing-${mode}.jsonl`);
  mkdirSync(join(file, ".."), { recursive: true });
  const line = JSON.stringify({
    mode,
    agent: agentId,
    seconds: Math.round(seconds),
    status,
    at: new Date().toISOString(),
  });
  appendFileSync(file, `${line}\n`, "utf8");
}

export function sdkMatrixLogDir(): string {
  const dir =
    process.env.LI_E2E_SDK_LOG_DIR?.trim() ||
    join(process.env.LI_CURSOR_AGENTS_ROOT ?? process.cwd(), "logs", "sdk-matrix");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Console + per-agent log file so matrix runs are inspectable without opening .md artifacts. */
export function logSdkMatrixRun(agentId: string, result: AgentRunResult, label?: string): void {
  const gaps = result.completion?.gaps ?? [];
  const evidence = result.completion?.evidence ?? [];
  const assistant = (result.trace?.assistant_text ?? "").trim();
  const outputHead = (result.outputText ?? "").trim().slice(0, 5000);
  const block = [
    "",
    "──────── sdk-matrix output ────────",
    label ? `${label} agent=${agentId}` : `agent=${agentId}`,
    `status=${result.status} backend=${result.backend} duration_ms=${result.durationMs}`,
    `stream: deltas=${result.trace?.deltas?.length ?? 0} steps=${result.trace?.steps?.length ?? 0} tools=${result.trace?.tool_call_count ?? 0}`,
    gaps.length ? `completion_gaps: ${gaps.join(" | ")}` : "completion_gaps: (none)",
    evidence.length ? `completion_evidence: ${evidence.join(" | ")}` : "",
    `output_path: ${result.outputPath}`,
    "--- trace assistant_text ---",
    assistant || "(empty)",
    "--- formatted output (head) ---",
    outputHead || "(empty)",
    "────────────────────────────────────",
  ]
    .filter(Boolean)
    .join("\n");
  console.log(block);
  const dir = sdkMatrixLogDir();
  appendFileSync(join(dir, `${agentId}.log`), `${block}\n`, "utf8");
  appendFileSync(join(dir, "all.log"), `${block}\n`, "utf8");
}

export function assertSdkStreamingTrace(
  agentId: string,
  trace: AgentRunTrace | undefined,
  detail?: Record<string, unknown>,
): void {
  const merged = trace ?? (detail?.run_trace as AgentRunTrace | undefined);
  assert.ok(
    traceHasLiveStream(merged),
    `${agentId}: expected SDK live stream in trace (deltas, thinking, assistant text, or tool steps)`,
  );
  const deltas = merged?.deltas ?? [];
  const steps = merged?.steps ?? [];
  assert.ok(
    deltas.length > 0 || steps.length > 0,
    `${agentId}: expected onDelta deltas and/or onStep steps (finest-grain stream), got deltas=${deltas.length} steps=${steps.length}`,
  );
  if (deltas.length > 0) {
    const types = [...new Set(deltas.map((d) => d.type))];
    assert.ok(
      types.some((t) => t.includes("delta") || t.includes("tool-call")),
      `${agentId}: expected stream delta types, got: ${types.join(", ")}`,
    );
  }
}
