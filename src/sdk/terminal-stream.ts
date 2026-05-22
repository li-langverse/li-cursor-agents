import type { ConversationStep } from "@cursor/sdk";
import type { InteractionUpdate } from "@cursor/sdk";

/** Stream SDK tool/thinking activity to stderr (CLI / plan-loop subprocess). */
export function terminalStreamEnabled(): boolean {
  const raw = process.env.LI_SDK_TERMINAL_STREAM?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "on") return true;
  return Boolean(process.stderr.isTTY);
}

function writeErr(line: string): void {
  process.stderr.write(`${line}\n`);
}

function toolLabel(update: Record<string, unknown>): string {
  const tool = String(update.tool ?? "tool");
  const args = update.args as Record<string, unknown> | undefined;
  const path =
    (typeof args?.path === "string" && args.path) ||
    (typeof args?.command === "string" && args.command.slice(0, 80)) ||
    "";
  return path ? `${tool} ${path}` : tool;
}

export function printSdkDeltaToTerminal(update: InteractionUpdate): void {
  if (!terminalStreamEnabled()) return;
  const u = update as Record<string, unknown>;
  switch (update.type) {
    case "tool-call-started":
      writeErr(`[sdk] ▶ ${toolLabel(u)}`);
      break;
    case "tool-call-completed": {
      const err = u.result as { status?: string } | undefined;
      const mark = err?.status === "success" ? "✓" : "✗";
      writeErr(`[sdk] ${mark} ${toolLabel(u)}`);
      break;
    }
    case "thinking-delta":
      process.stderr.write("·");
      break;
    case "text-delta":
      if (process.env.LI_SDK_TERMINAL_STREAM_TEXT === "1") {
        const text = String(u.text ?? "");
        if (text) process.stderr.write(text);
      }
      break;
    default:
      writeErr(`[sdk] ${update.type}`);
  }
}

export function printSdkStepToTerminal(step: ConversationStep): void {
  if (!terminalStreamEnabled()) return;
  if (step.type === "toolCall") {
    const msg = step.message as {
      type?: string;
      args?: { path?: string; command?: string };
      result?: { status?: string };
    };
    const path = msg.args?.path ?? msg.args?.command?.slice(0, 80) ?? "";
    const status = msg.result?.status === "success" ? "✓" : msg.result ? "✗" : "…";
    writeErr(`[sdk] ${status} ${msg.type ?? "tool"}${path ? ` ${path}` : ""}`);
  } else if (step.type === "thinkingMessage") {
    writeErr("[sdk] thinking…");
  } else if (step.type === "assistantMessage") {
    writeErr("[sdk] assistant reply");
  }
}

export function printSdkRunBanner(agentId: string, cwd: string): void {
  if (!terminalStreamEnabled()) return;
  writeErr(`[sdk] live stream on (agent=${agentId} cwd=${cwd}) — tools/thinking below; LI_SDK_TERMINAL_STREAM=0 to disable`);
}
