/** Trace GitHub artifacts (branches, commits, PRs, issues) back to swarm agent runs. */

export const SWARM_ATTR_GIT_TRAILER = "Li-Agent-Run";
export const SWARM_LABEL = "li-swarm";

export interface SwarmAttribution {
  run_id: string;
  agent_id: string;
  repo?: string;
  org?: string;
  branch?: string;
  goal_id?: string;
  vertical?: string;
  handoff_id?: string;
  /** ISO timestamp when attribution was recorded */
  stamped_at?: string;
}

export interface SwarmGitArtifact extends SwarmAttribution {
  commit_sha?: string;
  pr_url?: string;
  pr_number?: number;
  issue_url?: string;
  issue_number?: number;
}

export function branchNameForAgentRun(agentId: string, runId: string): string {
  return `chore/agent-${agentId}-${runId.slice(-8)}`;
}

export function githubLabelsForSwarm(agentId: string): string[] {
  return [SWARM_LABEL, `agent:${agentId}`];
}

export function buildSwarmAttribution(input: SwarmAttribution): SwarmAttribution {
  return {
    ...input,
    stamped_at: input.stamped_at ?? new Date().toISOString(),
  };
}

/** Git commit message trailer — survives `git log` and `gh api` queries. */
export function formatCommitMessageWithAttribution(message: string, attribution: SwarmAttribution): string {
  const trailer = `${SWARM_ATTR_GIT_TRAILER}: ${attribution.run_id}`;
  const agentTrailer = `Li-Agent-Id: ${attribution.agent_id}`;
  const base = message.trimEnd();
  if (base.includes(`${SWARM_ATTR_GIT_TRAILER}:`)) return base;
  return `${base}\n\n${trailer}\n${agentTrailer}\n`;
}

const GIT_TRAILER_RE = new RegExp(`^${SWARM_ATTR_GIT_TRAILER}:\\s*(\\S+)\\s*$`, "im");
const GIT_AGENT_RE = /^Li-Agent-Id:\s*(\S+)\s*$/im;

export function parseAttributionFromText(text: string): SwarmAttribution | null {
  if (!text?.trim()) return null;

  const runMatch = GIT_TRAILER_RE.exec(text);
  const agentMatch = GIT_AGENT_RE.exec(text);
  if (runMatch?.[1] && agentMatch?.[1]) {
    return { run_id: runMatch[1], agent_id: agentMatch[1] };
  }
  if (runMatch?.[1]) {
    const agentFromRun = /^([\w_]+)-\d+$/.exec(runMatch[1]);
    return {
      run_id: runMatch[1],
      agent_id: agentFromRun?.[1] ?? "unknown",
    };
  }

  const branchMatch = /chore\/agent-([\w_]+)-([a-f0-9]{6,8})/i.exec(text);
  if (branchMatch) {
    return {
      run_id: `${branchMatch[1]}-unknown-${branchMatch[2]}`,
      agent_id: branchMatch[1],
      branch: branchMatch[0],
    };
  }

  return null;
}

export function prKeyFromUrl(url: string): string | null {
  const gh = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i.exec(url);
  if (gh) return `${gh[2]}#${gh[3]}`;
  const gl = /\/([^/]+)\/-\/merge_requests\/(\d+)/i.exec(url);
  if (gl) return `${gl[1]}#${gl[2]}`;
  return null;
}

export function parsePrNumberFromUrl(url: string): number | undefined {
  const gh = /github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/i.exec(url);
  if (gh) return Number(gh[1]);
  const gl = /\/merge_requests\/(\d+)/i.exec(url);
  return gl ? Number(gl[1]) : undefined;
}

export function issueKeyFromUrl(url: string): string | null {
  const m = /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i.exec(url);
  if (!m) return null;
  return `${m[2]}#${m[3]}`;
}

export function defaultSwarmPrBody(
  agentId: string,
  attribution: SwarmAttribution,
  reason?: string,
): string {
  return [
    "## Agent deliverable",
    `- [x] Branch pushed by li-cursor-agents post-hook (\`${agentId}\`)`,
    `- [x] Swarm run \`${attribution.run_id}\` · agent \`${attribution.agent_id}\``,
    attribution.branch ? `- [x] Branch \`${attribution.branch}\`` : "",
    "- [x] CI triggered on PR",
    reason ? `- **Task:** ${reason}` : "",
    "- [ ] merge-approved (human after review)",
    "",
    "_Automated commit/push after agent run — review diff before merge._",
  ]
    .filter(Boolean)
    .join("\n");
}
