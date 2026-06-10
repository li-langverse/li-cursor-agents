import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import type { GaLaneId } from "./org-ga-supervisor-config.js";
import { defaultGaLanes } from "./org-ga-supervisor-config.js";

const DEFAULT_REPOS = [
  "lic",
  "lis",
  "li-cursor-agents",
  "benchmarks",
  "li-httpd",
  "lip",
  "lit",
  "roadmap",
];

export function loadOrgRepoList(): string[] {
  const explicit = process.env.LI_ORG_GA_REPOS?.trim();
  if (explicit) {
    return explicit.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const file = process.env.LI_ORG_GA_REPOS_FILE?.trim();
  const candidates = [
    file,
    join(agentsPackageRoot(), "..", "roadmap", ".github", "li-org-repos.txt"),
    join(agentsPackageRoot(), "fixtures", "li-org-repos.txt"),
  ].filter(Boolean) as string[];
  for (const path of candidates) {
    try {
      const repos: string[] = [];
      for (const line of readFileSync(path, "utf8").split("\n")) {
        const row = line.split("#", 1)[0]?.trim() ?? "";
        if (row) repos.push(row);
      }
      if (repos.length) return repos;
    } catch {
      /* try next */
    }
  }
  return DEFAULT_REPOS;
}

/** Round-robin pending (repo, lane) pairs not in active set. */
export function pickPendingGaWork(
  activeRefs: Set<string>,
  cursor: { repo: number; lane: number },
  lanes: GaLaneId[] = defaultGaLanes(),
  repos: string[] = loadOrgRepoList(),
): { ref: string; repo: string; lane: GaLaneId; nextCursor: typeof cursor } | null {
  if (!repos.length || !lanes.length) return null;
  const total = repos.length * lanes.length;
  for (let i = 0; i < total; i += 1) {
    const repoIdx = (cursor.repo + i) % repos.length;
    const laneIdx = (cursor.lane + Math.floor((cursor.repo + i) / repos.length)) % lanes.length;
    const repo = repos[repoIdx]!;
    const lane = lanes[laneIdx]!;
    const ref = `${repo}@${lane}`;
    if (!activeRefs.has(ref)) {
      return {
        ref,
        repo,
        lane,
        nextCursor: { repo: (repoIdx + 1) % repos.length, lane: laneIdx },
      };
    }
  }
  return null;
}
