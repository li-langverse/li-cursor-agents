import type { AgentDefinition } from "../types.js";

export type CursorSdkMode = "agent" | "plan" | "debug" | "ask";

const MODE_BY_AGENT: Record<string, CursorSdkMode> = {
  plan_verifier: "plan",
  issue_planner: "plan",
  org_issue_triage: "agent",
  implementation_gaps: "plan",
  package_architect: "plan",
  bug_fixer: "debug",
  ci_maintainer: "debug",
};

export function resolveCursorSdkMode(definition: AgentDefinition): CursorSdkMode {
  const override = process.env.LI_SDK_MODE_OVERRIDE?.trim().toLowerCase();
  if (override === "plan" || override === "debug" || override === "agent" || override === "ask") {
    return override;
  }
  return definition.cursorSdkMode ?? MODE_BY_AGENT[definition.id] ?? "agent";
}

export function sdkModeSystemPrefix(mode: CursorSdkMode): string {
  switch (mode) {
    case "plan":
      return [
        "## Cursor SDK mode: Plan",
        "Review approach and produce plans/digests/issues only. Do not ship product code in this run unless the handoff explicitly assigns implementation.",
        "",
      ].join("\n");
    case "debug":
      return [
        "## Cursor SDK mode: Debug",
        "Reproduce failures, form hypotheses, gather runtime evidence, then apply a minimal fix. Cite logs and test commands.",
        "",
      ].join("\n");
    case "ask":
      return [
        "## Cursor SDK mode: Ask",
        "Read-only exploration — do not edit files or open PRs.",
        "",
      ].join("\n");
    default:
      return "";
  }
}
