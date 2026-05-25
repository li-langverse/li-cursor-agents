import { formatAgentLogLine } from "../agent-log.js";

/** Always stderr — visible when dev:all prefixes lines with [worker]. */
export function workerConsole(
  component: string,
  level: string,
  message: string,
  extra?: string,
): void {
  console.error(formatAgentLogLine(component, level, message, extra));
}

export function workerBanner(lines: string[]): void {
  const bar = "─".repeat(56);
  console.error(bar);
  for (const line of lines) {
    console.error(line);
  }
  console.error(bar);
}
