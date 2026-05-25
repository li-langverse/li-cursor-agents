import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import type { AgentId } from "../types.js";

export interface RemediationIssue {
  surface: string;
  kind: "ui" | "ux";
  target_id: string;
  repo: string;
  title: string;
  problem: string;
  evidence: string[];
  sota_reference: string;
  remediation_checklist: string[];
  suggested_implementer: "code_implementer" | "docs_maintainer";
  priority: "P0" | "P1" | "P2";
  labels: string[];
}

export interface RemediationQueueItem {
  kind: "ui_remediation" | "ux_remediation";
  repo: string;
  surface: string;
  issue: number;
  title: string;
  remediation_summary: string;
  files_hint: string[];
  acceptance: string[];
  agent_source: AgentId;
  journeys?: string[];
}

export interface RemediationManifest {
  generated_at: string;
  agent_id: AgentId;
  issues: RemediationIssue[];
  implementation_queue: RemediationQueueItem[];
}

const UI_AGENTS = new Set<AgentId>(["docs_ui_tester", "gui_ui_tester", "tui_ui_tester"]);
const UX_AGENTS = new Set<AgentId>(["docs_ux_tester", "gui_ux_tester", "tui_ux_tester"]);

export function isUiUxTesterAgent(id: string): boolean {
  return UI_AGENTS.has(id as AgentId) || UX_AGENTS.has(id as AgentId);
}

function surfaceFromAgent(agentId: AgentId): string {
  if (agentId.startsWith("docs_")) return "docs";
  if (agentId.startsWith("gui_")) return "gui";
  return "tui";
}

function kindFromAgent(agentId: AgentId): "ui" | "ux" {
  return UI_AGENTS.has(agentId) ? "ui" : "ux";
}

function failingTargets(
  audit: Record<string, unknown> | undefined,
): Array<Record<string, unknown>> {
  if (!audit) return [];
  const targets = audit.targets;
  if (!Array.isArray(targets)) return [];
  return targets.filter((t) => t && typeof t === "object" && (t as Record<string, unknown>).status === "fail") as Array<
    Record<string, unknown>
  >;
}

export function buildRemediationManifest(
  agentId: AgentId,
  briefing: Record<string, unknown> | null,
): RemediationManifest {
  const kind = kindFromAgent(agentId);
  const surface = surfaceFromAgent(agentId);
  const auditKey = kind === "ui" ? "ui_audit" : "ux_audit";
  const audit = briefing?.[auditKey] as Record<string, unknown> | undefined;
  const fails = failingTargets(audit).filter((t) => {
    const sc = String(t.surface_class ?? t.surface ?? "");
    if (surface === "docs") return sc === "docs";
    if (surface === "gui") return sc === "gui_app" || sc === "gui_gen";
    return sc === "tui_app" || sc === "tui_gen";
  });

  const issues: RemediationIssue[] = [];
  const implementation_queue: RemediationQueueItem[] = [];

  fails.forEach((t, i) => {
    const targetId = String(t.target_id ?? "unknown");
    const repo = String(t.repo ?? "lic");
    const priority: RemediationIssue["priority"] = i === 0 ? "P0" : "P1";
    const issueNum = 9000 + i;

    const problem =
      kind === "ui"
        ? `UI regression on ${targetId} (contrast, baseline, or axe)`
        : `UX friction on ${targetId} (journey or rubric below threshold)`;

    const issue: RemediationIssue = {
      surface,
      kind,
      target_id: targetId,
      repo,
      title: `[${kind}-audit] ${problem}`,
      problem,
      evidence:
        kind === "ui"
          ? [
              `axe violations: ${JSON.stringify(t.axe_violations ?? [])}`,
              `pixel_diff: ${JSON.stringify(t.pixel_diff ?? {})}`,
            ]
          : [
              `friction: ${JSON.stringify(t.friction_points ?? [])}`,
              `rubric: ${JSON.stringify(t.rubric_scores ?? {})}`,
            ],
      sota_reference: "See ux-harness/sota/manifest.yaml — compare to listed SOTA URLs",
      remediation_checklist: [
        `[ ] File: target repo — apply fix per audit target ${targetId}`,
        `[ ] Test: python3 ux-harness/run_audit.py --target ${targetId} --mode ${kind} --mock`,
        `[ ] Acceptance: ${kind}-audit status pass for ${targetId}`,
      ],
      suggested_implementer: surface === "docs" && kind === "ux" ? "docs_maintainer" : "code_implementer",
      priority,
      labels: [`${kind}-audit`, `surface:${surface}`, "ready-for-implement"],
    };
    issues.push(issue);

    if (priority === "P0" || priority === "P1") {
      implementation_queue.push({
        kind: kind === "ui" ? "ui_remediation" : "ux_remediation",
        repo,
        surface,
        issue: issueNum,
        title: issue.title,
        remediation_summary: issue.problem,
        files_hint:
          surface === "docs"
            ? ["mkdocs.yml", "docs/stylesheets/extra.css"]
            : surface === "gui"
              ? ["dashboard-ui/"]
              : ["ux-harness/fixtures/"],
        acceptance: [`${kind}-audit ${targetId} green`],
        agent_source: agentId,
        ...(kind === "ux" && Array.isArray(t.friction_points) && t.friction_points[0]
          ? {
              journeys: [
                String(
                  (t.friction_points[0] as Record<string, unknown>).journey ?? "journey_fix",
                ),
              ],
            }
          : {}),
      });
    }
  });

  return {
    generated_at: new Date().toISOString(),
    agent_id: agentId,
    issues,
    implementation_queue,
  };
}

export function writeRemediationManifest(agentId: AgentId, briefing: Record<string, unknown> | null): string {
  const manifest = buildRemediationManifest(agentId, briefing);
  const dir = join(agentsPackageRoot(), "data", "latest");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "remediation_manifest.json");
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return path;
}

export function formatRemediationDeliverableSection(manifest: RemediationManifest): string {
  const lines = [
    "## Remediation manifest",
    "",
    `- Issues filed (mock): **${manifest.issues.length}**`,
    `- Queue items (P0/P1): **${manifest.implementation_queue.length}**`,
    "",
    "### GitHub issues (mock)",
  ];
  for (const issue of manifest.issues) {
    lines.push(
      "",
      `#### ${issue.title}`,
      "",
      `**Surface:** ${issue.surface} — ${issue.kind}`,
      "",
      `**Problem:** ${issue.problem}`,
      "",
      "**Remediation (implementer checklist)**",
      ...issue.remediation_checklist.map((c) => `- ${c}`),
      "",
      `**Suggested implementer:** ${issue.suggested_implementer}`,
      "",
      `**Priority:** ${issue.priority}`,
    );
  }
  lines.push("", "### implementation_queue", "", "```json", JSON.stringify(manifest.implementation_queue, null, 2), "```");
  return lines.join("\n");
}
