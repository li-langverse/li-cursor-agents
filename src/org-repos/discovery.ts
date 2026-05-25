/** Parse org-new-repos-discovery preflight JSON embedded in agent briefing. */

export interface OrgOnboardingStep {
  agent: string;
  action: string;
  reason: string;
}

export interface OrgNewRepoEntry {
  repo: string;
  classification: string;
  onboarding_steps: OrgOnboardingStep[];
}

export interface OrgNewReposDiscovery {
  org?: string;
  github_source?: string;
  github_repos?: string[];
  known_repos?: string[];
  new_repos: string[];
  stale_known_repos?: string[];
  new_repo_entries?: OrgNewRepoEntry[];
  summary?: {
    github_count?: number;
    known_count?: number;
    new_count?: number;
    stale_count?: number;
  };
}

export function orgNewReposDiscoveryFromBriefing(briefing: unknown): OrgNewReposDiscovery | null {
  if (!briefing || typeof briefing !== "object") return null;
  const raw = (briefing as Record<string, unknown>).org_new_repos_discovery;
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const newRepos = Array.isArray(d.new_repos)
    ? d.new_repos.filter((r): r is string => typeof r === "string" && r.length > 0)
    : [];
  return {
    org: typeof d.org === "string" ? d.org : undefined,
    github_source: typeof d.github_source === "string" ? d.github_source : undefined,
    github_repos: stringArray(d.github_repos),
    known_repos: stringArray(d.known_repos),
    new_repos: newRepos,
    stale_known_repos: stringArray(d.stale_known_repos),
    new_repo_entries: parseNewRepoEntries(d.new_repo_entries),
    summary:
      d.summary && typeof d.summary === "object"
        ? (d.summary as OrgNewReposDiscovery["summary"])
        : undefined,
  };
}

function stringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function parseNewRepoEntries(v: unknown): OrgNewRepoEntry[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: OrgNewRepoEntry[] = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const repo = typeof o.repo === "string" ? o.repo : "";
    if (!repo) continue;
    const steps: OrgOnboardingStep[] = [];
    if (Array.isArray(o.onboarding_steps)) {
      for (const s of o.onboarding_steps) {
        if (!s || typeof s !== "object") continue;
        const step = s as Record<string, unknown>;
        const agent = typeof step.agent === "string" ? step.agent : "";
        if (!agent) continue;
        steps.push({
          agent,
          action: typeof step.action === "string" ? step.action : "onboard",
          reason: typeof step.reason === "string" ? step.reason : `Onboard ${repo}`,
        });
      }
    }
    out.push({
      repo,
      classification: typeof o.classification === "string" ? o.classification : "unclassified",
      onboarding_steps: steps,
    });
  }
  return out.length ? out : undefined;
}

export function recommendOnboarderReason(discovery: OrgNewReposDiscovery | null): string | null {
  if (!discovery?.new_repos?.length) return null;
  const names = discovery.new_repos.slice(0, 5).join(", ");
  const more = discovery.new_repos.length > 5 ? ` (+${discovery.new_repos.length - 5} more)` : "";
  return `${discovery.new_repos.length} new org repo(s): ${names}${more}`;
}
