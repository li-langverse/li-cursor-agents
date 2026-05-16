import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CycleRecord } from "./history.js";

export interface DigestOptions {
  root: string;
  cycle: CycleRecord;
}

export function generateDigest(options: DigestOptions): string {
  const { cycle } = options;
  const lines: string[] = [];

  lines.push(`# Overnight Cycle Digest`);
  lines.push("");
  lines.push(`**Cycle:** ${cycle.cycleId}`);
  lines.push(`**Started:** ${cycle.startedAt}`);
  lines.push(`**Completed:** ${cycle.completedAt ?? "in-progress"}`);
  lines.push(`**Agents run:** ${cycle.agentsRun.join(", ")}`);
  lines.push("");

  lines.push("## Results Summary");
  lines.push("");
  lines.push("| Agent | Status | Duration | Findings |");
  lines.push("|-------|--------|----------|----------|");

  for (const result of cycle.results) {
    const findingsCount = result.findings?.length ?? 0;
    const duration = `${(result.durationMs / 1000).toFixed(1)}s`;
    const statusEmoji = result.status === "finished" ? "✅" : result.status === "error" ? "❌" : "⏭️";
    lines.push(
      `| ${result.agentId} | ${statusEmoji} ${result.status} | ${duration} | ${findingsCount} |`,
    );
  }

  lines.push("");

  const allFindings = cycle.results.flatMap((r) => (r.findings ?? []).map((f) => ({ agent: r.agentId, finding: f })));
  if (allFindings.length > 0) {
    lines.push("## Key Findings");
    lines.push("");
    for (const { agent, finding } of allFindings.slice(0, 15)) {
      lines.push(`- **${agent}:** ${finding}`);
    }
    lines.push("");
  }

  if (cycle.nextPriorities && cycle.nextPriorities.length > 0) {
    lines.push("## Next Cycle Priorities");
    lines.push("");
    for (const p of cycle.nextPriorities) {
      lines.push(`- ${p}`);
    }
    lines.push("");
  }

  lines.push("## Self-Improvement Notes");
  lines.push("");
  lines.push(generateSelfImprovementNotes(cycle));

  return lines.join("\n");
}

function generateSelfImprovementNotes(cycle: CycleRecord): string {
  const notes: string[] = [];
  const erroredAgents = cycle.results.filter((r) => r.status === "error");
  const successfulAgents = cycle.results.filter((r) => r.status === "finished");

  if (erroredAgents.length > 0) {
    notes.push(
      `- **Errors detected:** ${erroredAgents.map((a) => a.agentId).join(", ")} — consider adjusting prompts or preflight data`,
    );
  }

  if (successfulAgents.length > 0) {
    const avgDuration = successfulAgents.reduce((sum, a) => sum + a.durationMs, 0) / successfulAgents.length;
    notes.push(`- **Average agent duration:** ${(avgDuration / 1000).toFixed(1)}s`);
  }

  const lowFindingAgents = cycle.results.filter(
    (r) => r.status === "finished" && (r.findings?.length ?? 0) === 0,
  );
  if (lowFindingAgents.length > 0) {
    notes.push(
      `- **Low-yield agents:** ${lowFindingAgents.map((a) => a.agentId).join(", ")} — may benefit from richer preflight data or prompt refinement`,
    );
  }

  const productiveAgents = cycle.results.filter(
    (r) => r.status === "finished" && (r.findings?.length ?? 0) > 3,
  );
  if (productiveAgents.length > 0) {
    notes.push(
      `- **High-yield agents:** ${productiveAgents.map((a) => a.agentId).join(", ")} — prioritize in next cycle`,
    );
  }

  return notes.length > 0 ? notes.join("\n") : "- No notable patterns this cycle";
}

export function writeDigest(root: string, cycle: CycleRecord, content: string): string {
  const digestDir = join(root, "data", "digests");
  mkdirSync(digestDir, { recursive: true });
  const filename = `${cycle.cycleId}.md`;
  const path = join(digestDir, filename);
  writeFileSync(path, content, "utf8");
  return path;
}

export function loadLatestDigest(root: string): string | undefined {
  const digestDir = join(root, "data", "digests");
  if (!existsSync(digestDir)) return undefined;
  const files = readdirSync(digestDir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  if (files.length === 0) return undefined;
  return readFileSync(join(digestDir, files[files.length - 1]), "utf8");
}
