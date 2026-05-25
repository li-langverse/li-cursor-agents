import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConversationStep } from "@cursor/sdk";
import type { InteractionUpdate } from "@cursor/sdk";
import { runsDir } from "../control-plane/paths.js";
import { dbEnabled, getSupabase } from "./client.js";
import { liveStreamDbEnabled } from "./live-stream-persist.js";
import { withSupabaseRetry } from "./supabase-retry.js";

/** Structured payload stored in agent_run_events.payload (and disk JSONL). */
export interface RunEventPayload {
  ts: string;
  kind: string;
  message: string;
  tool_name?: string;
  path?: string;
}

export interface RunEventRecord {
  seq: number;
  event_type: string;
  payload: RunEventPayload;
  created_at?: string;
}

const TOKEN_DELTA_TYPES = new Set(["token-delta", "thinking-delta", "text-delta"]);

const PERSIST_DELTA_TYPES = new Set([
  "tool-call-started",
  "tool-call-completed",
]);

function eventsDir(): string {
  const dir = join(runsDir(), "events");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function eventsPath(runId: string): string {
  return join(eventsDir(), `${runId}.jsonl`);
}

/** Default on: do not persist token/text/thinking deltas to agent_run_events. */
export function skipTokenStreamDeltas(): boolean {
  const raw = process.env.LI_SDK_LOG_SKIP_TOKEN_DELTAS?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}

export function runEventsPersistEnabled(): boolean {
  if (liveStreamDbEnabled()) return true;
  return !dbEnabled();
}

function nextSeq(runId: string): number {
  const n = (seqByRun.get(runId) ?? -1) + 1;
  seqByRun.set(runId, n);
  return n;
}

const seqByRun = new Map<string, number>();
const pendingByRun = new Map<string, RunEventRecord[]>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function resetRunEventsState(runId?: string): void {
  if (runId) {
    seqByRun.delete(runId);
    pendingByRun.delete(runId);
    const t = flushTimers.get(runId);
    if (t) clearTimeout(t);
    flushTimers.delete(runId);
    return;
  }
  seqByRun.clear();
  pendingByRun.clear();
  for (const t of flushTimers.values()) clearTimeout(t);
  flushTimers.clear();
}

function toolPathFromArgs(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;
  if (typeof args.path === "string") return args.path;
  if (typeof args.command === "string") return args.command.slice(0, 200);
  return undefined;
}

export function eventFromInteractionUpdate(update: InteractionUpdate): RunEventRecord | null {
  const type = update.type;
  if (skipTokenStreamDeltas() && TOKEN_DELTA_TYPES.has(type)) return null;
  if (!PERSIST_DELTA_TYPES.has(type)) return null;

  const u = update as Record<string, unknown>;
  const tool = String(u.tool ?? "tool");
  const args = u.args as Record<string, unknown> | undefined;
  const path = toolPathFromArgs(args);
  const ts = new Date().toISOString();

  if (type === "tool-call-started") {
    return {
      seq: 0,
      event_type: "tool_call_started",
      payload: {
        ts,
        kind: "tool",
        message: path ? `${tool} ${path}` : tool,
        tool_name: tool,
        path,
      },
    };
  }

  if (type === "tool-call-completed") {
    const result = u.result as { status?: string } | undefined;
    const ok = result?.status === "success";
    return {
      seq: 0,
      event_type: "tool_call_completed",
      payload: {
        ts,
        kind: "tool",
        message: `${ok ? "✓" : "✗"} ${path ? `${tool} ${path}` : tool}`,
        tool_name: tool,
        path,
      },
    };
  }

  return null;
}

export function eventFromConversationStep(step: ConversationStep): RunEventRecord | null {
  const ts = new Date().toISOString();

  if (step.type === "thinkingMessage") {
    const text = step.message?.text?.trim();
    if (!text) return null;
    return {
      seq: 0,
      event_type: "step_thinking",
      payload: {
        ts,
        kind: "step",
        message: text.length > 200 ? `${text.slice(0, 200)}…` : text,
      },
    };
  }

  if (step.type === "assistantMessage") {
    const text = step.message?.text?.trim();
    if (!text) return null;
    return {
      seq: 0,
      event_type: "step_assistant",
      payload: {
        ts,
        kind: "step",
        message: text.length > 200 ? `${text.slice(0, 200)}…` : text,
      },
    };
  }

  if (step.type === "toolCall") {
    const msg = (step.message ?? {}) as Record<string, unknown>;
    const tool = String(msg.type ?? "tool");
    const args = msg.args as Record<string, unknown> | undefined;
    const path = toolPathFromArgs(args) ?? (tool === "shell" ? "(shell)" : undefined);
    const result = msg.result as { status?: string } | undefined;
    const ok = result?.status === "success";
    const status = result ? (ok ? "✓" : "✗") : "…";
    const kind = tool === "shell" ? "shell" : ["edit", "write", "delete"].includes(tool) ? "file" : "tool";
    return {
      seq: 0,
      event_type: kind === "file" ? "file_edit" : kind === "shell" ? "shell_output" : "tool_step",
      payload: {
        ts,
        kind,
        message: `${status} ${path ?? tool}`,
        tool_name: tool,
        path,
      },
    };
  }

  return null;
}

export function recordRunEvent(runId: string, partial: Omit<RunEventRecord, "seq">): void {
  if (!runEventsPersistEnabled()) return;
  const row: RunEventRecord = { ...partial, seq: nextSeq(runId) };
  const pending = pendingByRun.get(runId) ?? [];
  pending.push(row);
  pendingByRun.set(runId, pending);
  scheduleFlush(runId);
}

export function recordSdkUpdate(runId: string, update: InteractionUpdate): void {
  const row = eventFromInteractionUpdate(update);
  if (!row) return;
  recordRunEvent(runId, row);
}

export function recordSdkStep(runId: string, step: ConversationStep): void {
  const row = eventFromConversationStep(step);
  if (!row) return;
  recordRunEvent(runId, row);
}

export function recordRunStarted(runId: string, agentId: string, reason?: string): void {
  recordRunEvent(runId, {
    event_type: "run_started",
    payload: {
      ts: new Date().toISOString(),
      kind: "lifecycle",
      message: reason?.trim() || `Agent ${agentId} run started`,
    },
  });
}

function scheduleFlush(runId: string): void {
  const debounceMs = Number(process.env.LI_RUN_EVENTS_FLUSH_MS ?? 80);
  const prev = flushTimers.get(runId);
  if (prev) clearTimeout(prev);
  flushTimers.set(
    runId,
    setTimeout(() => {
      flushTimers.delete(runId);
      void flushRunEvents(runId).catch(() => {});
    }, Number.isFinite(debounceMs) && debounceMs >= 0 ? debounceMs : 80),
  );
}

export async function flushRunEvents(runId: string): Promise<void> {
  const batch = pendingByRun.get(runId);
  if (!batch?.length) return;
  pendingByRun.set(runId, []);

  if (liveStreamDbEnabled()) {
    await withSupabaseRetry("flushRunEvents", async () => {
      const rows = batch.map((e) => ({
        run_id: runId,
        seq: e.seq,
        event_type: e.event_type,
        payload: e.payload,
      }));
      const { error } = await getSupabase().from("agent_run_events").insert(rows);
      if (error) throw new Error(`agent_run_events insert: ${error.message}`);
    });
  } else {
    appendDiskEvents(runId, batch);
  }
}

function appendDiskEvents(runId: string, batch: RunEventRecord[]): void {
  const path = eventsPath(runId);
  for (const e of batch) {
    appendFileSync(path, `${JSON.stringify({ seq: e.seq, event_type: e.event_type, payload: e.payload })}\n`, "utf8");
  }
}

function readDiskEvents(runId: string, limit: number): RunEventRecord[] {
  const path = eventsPath(runId);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  const rows: RunEventRecord[] = [];
  for (const line of lines) {
    try {
      const o = JSON.parse(line) as RunEventRecord;
      rows.push(o);
    } catch {
      /* skip corrupt line */
    }
  }
  rows.sort((a, b) => a.seq - b.seq);
  if (limit > 0 && rows.length > limit) return rows.slice(-limit);
  return rows;
}

export async function getRunEventsForApi(
  runId: string,
  limit = 80,
): Promise<RunEventRecord[]> {
  const cap = Math.min(500, Math.max(1, limit));

  if (liveStreamDbEnabled()) {
    const { data, error } = await getSupabase()
      .from("agent_run_events")
      .select("seq, event_type, payload, created_at")
      .eq("run_id", runId)
      .order("seq", { ascending: true });
    if (error) throw new Error(`getRunEventsForApi: ${error.message}`);
    const rows = (data ?? []).map((r) => ({
      seq: Number(r.seq),
      event_type: String(r.event_type),
      payload: r.payload as RunEventPayload,
      created_at: r.created_at ? String(r.created_at) : undefined,
    }));
    if (rows.length <= cap) return rows;
    return rows.slice(-cap);
  }

  return readDiskEvents(runId, cap);
}
