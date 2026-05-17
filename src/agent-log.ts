/** ISO-8601 prefix for stderr lines (keep-agents.log, supervisor subprocess). */
const ISO_LOG_PREFIX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /;

export function formatAgentLogLine(
  component: string,
  level: string,
  message: string,
  extra?: string,
): string {
  const suffix = extra ? ` ${extra}` : "";
  return `${new Date().toISOString()} [${component}] ${level}: ${message}${suffix}`;
}

export function agentLog(
  component: string,
  level: string,
  message: string,
  extra?: string,
): void {
  console.error(formatAgentLogLine(component, level, message, extra));
}

/** Regression helper: every operational log line should start with an ISO timestamp. */
export function hasIsoLogPrefix(line: string): boolean {
  return ISO_LOG_PREFIX.test(line.trim());
}
