import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  eventFromConversationStep,
  eventFromInteractionUpdate,
  flushRunEvents,
  getRunEventsForApi,
  recordRunEvent,
  recordSdkUpdate,
  resetRunEventsState,
  runEventsPersistEnabled,
  skipTokenStreamDeltas,
} from "./run-events.js";

describe("run-events", () => {
  it("runEventsPersistEnabled stays on when Supabase is configured", () => {
    const prevStore = process.env.LI_CONTROL_PLANE_STORE;
    const prevLive = process.env.LI_LIVE_STREAM_DB;
    const prevEventsDb = process.env.LI_RUN_EVENTS_DB;
    process.env.LI_CONTROL_PLANE_STORE = "supabase";
    delete process.env.LI_STACK_SKIP_SUPABASE;
    process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-key";
    process.env.LI_LIVE_STREAM_DB = "0";
    assert.equal(runEventsPersistEnabled(), true);
    process.env.LI_RUN_EVENTS_DB = "0";
    assert.equal(runEventsPersistEnabled(), false);
    if (prevStore === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
    else process.env.LI_CONTROL_PLANE_STORE = prevStore;
    if (prevLive === undefined) delete process.env.LI_LIVE_STREAM_DB;
    else process.env.LI_LIVE_STREAM_DB = prevLive;
    if (prevEventsDb === undefined) delete process.env.LI_RUN_EVENTS_DB;
    else process.env.LI_RUN_EVENTS_DB = prevEventsDb;
  });

  it("recordRunEvent persists to disk JSONL when store is disk", async () => {
    const prev = {
      store: process.env.LI_CONTROL_PLANE_STORE,
      skip: process.env.LI_STACK_SKIP_SUPABASE,
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
      runsDir: process.env.LI_RUNS_DIR,
    };
    const tmp = mkdtempSync(join(tmpdir(), "li-run-events-"));
    process.env.LI_CONTROL_PLANE_STORE = "disk";
    process.env.LI_STACK_SKIP_SUPABASE = "1";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.LI_RUNS_DIR = join(tmp, "runs");
    resetRunEventsState("disk-persist-run");

    recordRunEvent("disk-persist-run", {
      event_type: "run_started",
      payload: { ts: new Date().toISOString(), kind: "lifecycle", message: "test" },
    });
    await flushRunEvents("disk-persist-run");
    const rows = await getRunEventsForApi("disk-persist-run", 10);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.event_type, "run_started");

    resetRunEventsState("disk-persist-run");
    rmSync(tmp, { recursive: true, force: true });
    if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
    else process.env.LI_CONTROL_PLANE_STORE = prev.store;
    if (prev.skip === undefined) delete process.env.LI_STACK_SKIP_SUPABASE;
    else process.env.LI_STACK_SKIP_SUPABASE = prev.skip;
    if (prev.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prev.url;
    if (prev.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.key;
    if (prev.runsDir === undefined) delete process.env.LI_RUNS_DIR;
    else process.env.LI_RUNS_DIR = prev.runsDir;
  });

  it("skipTokenStreamDeltas defaults on", () => {
    const prev = process.env.LI_SDK_LOG_SKIP_TOKEN_DELTAS;
    delete process.env.LI_SDK_LOG_SKIP_TOKEN_DELTAS;
    assert.equal(skipTokenStreamDeltas(), true);
    process.env.LI_SDK_LOG_SKIP_TOKEN_DELTAS = "0";
    assert.equal(skipTokenStreamDeltas(), false);
    if (prev === undefined) delete process.env.LI_SDK_LOG_SKIP_TOKEN_DELTAS;
    else process.env.LI_SDK_LOG_SKIP_TOKEN_DELTAS = prev;
  });

  it("skips token deltas for persistence", () => {
    assert.equal(
      eventFromInteractionUpdate({ type: "text-delta", text: "x" } as { type: "text-delta"; text: string }),
      null,
    );
    assert.equal(
      eventFromInteractionUpdate({ type: "thinking-delta", text: "t" } as {
        type: "thinking-delta";
        text: string;
      }),
      null,
    );
  });

  it("maps tool-call-started to structured event", () => {
    const row = eventFromInteractionUpdate({
      type: "tool-call-started",
      tool: "edit",
      args: { path: "src/foo.ts" },
    } as { type: "tool-call-started"; tool: string; args: { path: string } });
    assert.ok(row);
    assert.equal(row!.event_type, "tool_call_started");
    assert.equal(row!.payload.tool_name, "edit");
    assert.equal(row!.payload.path, "src/foo.ts");
  });

  it("maps toolCall step to file_edit", () => {
    const row = eventFromConversationStep({
      type: "toolCall",
      message: {
        type: "edit",
        args: { path: "a.md" },
        result: { status: "success" },
      },
    } as import("@cursor/sdk").ConversationStep);
    assert.ok(row);
    assert.equal(row!.event_type, "file_edit");
    assert.match(row!.payload.message, /✓/);
  });

  it("maps tool-call-completed to structured event", () => {
    const row = eventFromInteractionUpdate({
      type: "tool-call-completed",
      tool: "write",
      args: { path: "out.txt" },
      result: { status: "success" },
    } as {
      type: "tool-call-completed";
      tool: string;
      args: { path: string };
      result: { status: string };
    });
    assert.ok(row);
    assert.equal(row!.event_type, "tool_call_completed");
    assert.match(row!.payload.message, /✓/);
  });

  it("maps shell toolCall to shell_output", () => {
    const row = eventFromConversationStep({
      type: "toolCall",
      message: {
        type: "shell",
        args: { command: "npm test" },
        result: { status: "success" },
      },
    } as import("@cursor/sdk").ConversationStep);
    assert.ok(row);
    assert.equal(row!.event_type, "shell_output");
    assert.equal(row!.payload.kind, "shell");
  });

  it("recordSdkUpdate persists tool events but skips token deltas on disk", async () => {
    const prev = {
      store: process.env.LI_CONTROL_PLANE_STORE,
      skip: process.env.LI_STACK_SKIP_SUPABASE,
      runsDir: process.env.LI_RUNS_DIR,
    };
    const tmp = mkdtempSync(join(tmpdir(), "li-run-events-sdk-"));
    process.env.LI_CONTROL_PLANE_STORE = "disk";
    process.env.LI_STACK_SKIP_SUPABASE = "1";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.LI_RUNS_DIR = join(tmp, "runs");
    const runId = "sdk-filter-run";
    resetRunEventsState(runId);

    recordSdkUpdate(runId, { type: "text-delta", text: "ignored" } as {
      type: "text-delta";
      text: string;
    });
    recordSdkUpdate(runId, {
      type: "tool-call-started",
      tool: "read",
      args: { path: "src/db/run-events.ts" },
    } as { type: "tool-call-started"; tool: string; args: { path: string } });
    await flushRunEvents(runId);

    const rows = await getRunEventsForApi(runId, 20);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.event_type, "tool_call_started");
    assert.equal(rows[0]!.payload.path, "src/db/run-events.ts");

    resetRunEventsState(runId);
    rmSync(tmp, { recursive: true, force: true });
    if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
    else process.env.LI_CONTROL_PLANE_STORE = prev.store;
    if (prev.skip === undefined) delete process.env.LI_STACK_SKIP_SUPABASE;
    else process.env.LI_STACK_SKIP_SUPABASE = prev.skip;
    if (prev.runsDir === undefined) delete process.env.LI_RUNS_DIR;
    else process.env.LI_RUNS_DIR = prev.runsDir;
  });
});
