import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { agentsPackageRoot } from "../runner.js";

export function resolveBriefingPath(benchmarksRoot?: string): string {
  const root =
    benchmarksRoot?.trim() ||
    process.env.BENCHMARKS_ROOT?.trim() ||
    join(agentsPackageRoot(), "fixtures", "e2e-benchmarks");
  return join(root, "data", "latest", "agent-briefing.json");
}

export function loadBriefingJson(benchmarksRoot?: string): Record<string, unknown> | null {
  const path = resolveBriefingPath(benchmarksRoot);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

export function listOrgReposFromBriefing(briefing: Record<string, unknown> | null): string[] {
  if (!briefing) return [];
  const repos = new Set<string>();
  const explorer = briefing.ecosystem_explorer as Record<string, unknown> | undefined;
  if (Array.isArray(explorer?.repos)) {
    for (const r of explorer.repos) {
      if (typeof r === "string") repos.add(r);
      else if (r && typeof r === "object" && typeof (r as Record<string, unknown>).name === "string") {
        repos.add(String((r as Record<string, unknown>).name));
      }
    }
  }
  const orgPackages = briefing.org_packages as Record<string, unknown> | undefined;
  if (orgPackages && typeof orgPackages === "object") {
    for (const key of Object.keys(orgPackages)) repos.add(key);
  }
  const discovery = briefing.org_new_repos_discovery as Record<string, unknown> | undefined;
  if (Array.isArray(discovery?.github_repos)) {
    for (const r of discovery.github_repos) {
      if (typeof r === "string" && r) repos.add(r);
    }
  }
  return [...repos].sort();
}

export function describePackageFromBriefing(
  briefing: Record<string, unknown> | null,
  packageId: string,
): Record<string, unknown> | null {
  if (!briefing || !packageId) return null;
  const org = briefing.org_packages as Record<string, unknown> | undefined;
  if (org?.[packageId] && typeof org[packageId] === "object") {
    return { source: "org_packages", package_id: packageId, ...(org[packageId] as object) };
  }
  const lic = briefing.lic_packages as Record<string, unknown> | undefined;
  if (lic?.[packageId] && typeof lic[packageId] === "object") {
    return { source: "lic_packages", package_id: packageId, ...(lic[packageId] as object) };
  }
  return null;
}

function repoRootOnDisk(repo: string, benchmarksRoot?: string): string | null {
  const bench =
    benchmarksRoot?.trim() ||
    process.env.BENCHMARKS_ROOT?.trim() ||
    join(agentsPackageRoot(), "fixtures", "e2e-benchmarks");
  const sibling = join(bench, "..", repo);
  if (existsSync(sibling)) return sibling;
  const fixtureTree = join(bench, "fixtures", "explorer-trees", repo);
  if (existsSync(fixtureTree)) return fixtureTree;
  return null;
}

function walkFiles(
  dir: string,
  query: string,
  maxResults: number,
  acc: Array<{ path: string; snippet: string }>,
  root: string,
): void {
  if (acc.length >= maxResults) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  const q = query.toLowerCase();
  for (const name of entries) {
    if (acc.length >= maxResults) return;
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkFiles(full, query, maxResults, acc, root);
      continue;
    }
    const rel = relative(root, full);
    if (!rel.toLowerCase().includes(q) && !name.toLowerCase().includes(q)) {
      try {
        const text = readFileSync(full, "utf8").slice(0, 8000);
        if (!text.toLowerCase().includes(q)) continue;
        acc.push({ path: rel, snippet: text.slice(0, 200).replace(/\s+/g, " ") });
      } catch {
        continue;
      }
    } else {
      acc.push({ path: rel, snippet: `(match in path: ${name})` });
    }
  }
}

export function searchRepoTree(
  repo: string,
  query: string,
  maxResults = 20,
  benchmarksRoot?: string,
): { repo: string; root: string | null; matches: Array<{ path: string; snippet: string }> } {
  const root = repoRootOnDisk(repo, benchmarksRoot);
  if (!root) {
    return { repo, root: null, matches: [] };
  }
  const matches: Array<{ path: string; snippet: string }> = [];
  walkFiles(root, query.trim() || "", Math.min(Math.max(maxResults, 1), 50), matches, root);
  return { repo, root, matches };
}
