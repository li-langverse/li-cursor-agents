import type { RunCatalogEntry } from "./runs-catalog.js";
import {
  parseAttributionFromText,
  prKeyFromUrl,
  issueKeyFromUrl,
  type SwarmGitArtifact,
} from "../swarm/swarm-attribution.js";

export interface SwarmArtifactsIndex {
  generated_at: string;
  runs_scanned: number;
  artifact_count: number;
  artifacts: SwarmGitArtifact[];
  by_agent: Record<string, number>;
  lookup: {
    run_id: Record<string, SwarmGitArtifact>;
    branch: Record<string, string>;
    pr: Record<string, string>;
    issue: Record<string, string>;
    commit: Record<string, string>;
  };
}

function metaArtifact(meta: Record<string, unknown> | null | undefined): SwarmGitArtifact | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = meta.swarm_attribution ?? meta.swarm_git_artifact;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.run_id || !o.agent_id) return null;
  return o as unknown as SwarmGitArtifact;
}

function artifactFromRun(entry: RunCatalogEntry): SwarmGitArtifact | null {
  const meta = entry.meta as Record<string, unknown> | undefined;
  const fromMeta = metaArtifact(meta ?? null);
  if (fromMeta) return fromMeta;

  const text = [entry.summary, entry.output_preview, ...(entry.pr_urls ?? [])].filter(Boolean).join("\n");
  const parsed = parseAttributionFromText(text);
  if (!parsed) return null;

  const artifact: SwarmGitArtifact = { ...parsed };
  const prUrl = entry.pr_urls?.[0];
  if (prUrl) {
    artifact.pr_url = prUrl;
    artifact.pr_number = Number(/pull\/(\d+)/.exec(prUrl)?.[1] ?? "");
  }
  return artifact;
}

export function buildSwarmArtifactsIndex(
  runs: readonly RunCatalogEntry[],
  options?: { run_id?: string; agent_id?: string; branch?: string; pr?: string; limit?: number },
): SwarmArtifactsIndex {
  const limit = Math.min(500, Math.max(1, options?.limit ?? 100));
  const artifacts: SwarmGitArtifact[] = [];

  for (const run of runs) {
    const artifact = artifactFromRun(run);
    if (!artifact) continue;
    artifact.run_id = artifact.run_id || run.run_id;
    artifact.agent_id = artifact.agent_id || run.agent_id;
    artifacts.push(artifact);
  }

  let filtered = artifacts;
  if (options?.run_id) {
    filtered = filtered.filter((a) => a.run_id === options.run_id);
  }
  if (options?.agent_id) {
    filtered = filtered.filter((a) => a.agent_id === options.agent_id);
  }
  if (options?.branch) {
    const b = options.branch.toLowerCase();
    filtered = filtered.filter((a) => a.branch?.toLowerCase() === b);
  }
  if (options?.pr) {
    const key = options.pr.includes("github.com")
      ? prKeyFromUrl(options.pr) ?? options.pr
      : options.pr;
    filtered = filtered.filter((a) => {
      if (!a.pr_url) return false;
      const k = prKeyFromUrl(a.pr_url);
      return k === key || a.pr_url === options.pr;
    });
  }

  filtered = filtered.slice(0, limit);

  const by_agent: Record<string, number> = {};
  const lookup: SwarmArtifactsIndex["lookup"] = {
    run_id: {},
    branch: {},
    pr: {},
    issue: {},
    commit: {},
  };

  for (const a of filtered) {
    by_agent[a.agent_id] = (by_agent[a.agent_id] ?? 0) + 1;
    lookup.run_id[a.run_id] = a;
    if (a.branch) lookup.branch[a.branch] = a.run_id;
    if (a.pr_url) {
      const k = prKeyFromUrl(a.pr_url);
      if (k) lookup.pr[k] = a.run_id;
    }
    if (a.issue_url) {
      const k = issueKeyFromUrl(a.issue_url);
      if (k) lookup.issue[k] = a.run_id;
    }
    if (a.commit_sha) lookup.commit[a.commit_sha] = a.run_id;
  }

  return {
    generated_at: new Date().toISOString(),
    runs_scanned: runs.length,
    artifact_count: filtered.length,
    artifacts: filtered,
    by_agent,
    lookup,
  };
}
