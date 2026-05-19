import { AGENT_REGISTRY } from "../agents/registry.js";
import { handleDbApiRequest } from "../db-api/index.js";
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
