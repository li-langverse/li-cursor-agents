import { ghRequest, GitHubIssueRequestError } from "./org-issue-github.js";

export const ORG_GITHUB_ORG = "li-langverse";

export const NOVEL_RESEARCH_ISSUE_LABELS = [
  "plan-needed",
  "novel-research",
  "ecosystem-gap",
] as const;

export interface CreateGitHubIssueInput {
  repo: string;
  title: string;
  body: string;
  labels?: string[];
  dryRun?: boolean;
}

export interface CreateGitHubIssueResult {
  ok: boolean;
  created: boolean;
  number?: number;
  html_url?: string;
  labels?: string[];
  error?: string;
  dry_run?: boolean;
}

export interface CreateGitHubRepoInput {
  name: string;
  description: string;
  rationale: string;
  private?: boolean;
  dryRun?: boolean;
}

export interface CreateGitHubRepoResult {
  ok: boolean;
  created: boolean;
  full_name?: string;
  html_url?: string;
  error?: string;
  dry_run?: boolean;
}

function normalizeRepoName(repo: string): string {
  return repo.trim().replace(/^li-langverse\//, "");
}

export async function createGitHubIssueAsync(
  input: CreateGitHubIssueInput,
): Promise<CreateGitHubIssueResult> {
  const repo = normalizeRepoName(input.repo);
  const title = input.title.trim();
  const body = input.body.trim();
  if (!repo || !title || !body) {
    return { ok: false, created: false, error: "repo, title, and body are required" };
  }

  const labels = (input.labels?.length ? input.labels : [...NOVEL_RESEARCH_ISSUE_LABELS]).map((l) =>
    l.trim(),
  );

  if (input.dryRun) {
    return {
      ok: true,
      created: true,
      dry_run: true,
      html_url: `https://github.com/${ORG_GITHUB_ORG}/${repo}/issues/dry-run`,
      labels,
    };
  }

  const res = await ghRequest<{
    number?: number;
    html_url?: string;
    labels?: Array<{ name?: string }>;
  }>("POST", `/repos/${ORG_GITHUB_ORG}/${repo}/issues`, {
    title,
    body,
    labels,
  });

  if (res.status !== 201 || !res.data) {
    return {
      ok: false,
      created: false,
      error: `GitHub create issue failed (${res.status}): ${res.raw.slice(0, 400)}`,
    };
  }

  return {
    ok: true,
    created: true,
    number: res.data.number,
    html_url: res.data.html_url,
    labels: (res.data.labels ?? []).map((l) => l.name ?? "").filter(Boolean),
  };
}

export async function createGitHubRepoAsync(
  input: CreateGitHubRepoInput,
): Promise<CreateGitHubRepoResult> {
  const name = input.name.trim().replace(/^li-langverse\//, "");
  const description = input.description.trim();
  const rationale = input.rationale.trim();
  if (!name || !description || !rationale) {
    return { ok: false, created: false, error: "name, description, and rationale are required" };
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    return { ok: false, created: false, error: "invalid repo name" };
  }

  if (input.dryRun) {
    return {
      ok: true,
      created: true,
      dry_run: true,
      full_name: `${ORG_GITHUB_ORG}/${name}`,
      html_url: `https://github.com/${ORG_GITHUB_ORG}/${name}`,
    };
  }

  const res = await ghRequest<{ full_name?: string; html_url?: string }>(
    "POST",
    `/orgs/${ORG_GITHUB_ORG}/repos`,
    {
      name,
      description: `${description}\n\n---\nRationale (novel research lane):\n${rationale}`,
      private: input.private !== false,
      auto_init: true,
    },
  );

  if (res.status !== 201 || !res.data) {
    return {
      ok: false,
      created: false,
      error: `GitHub create repo failed (${res.status}): ${res.raw.slice(0, 400)}`,
    };
  }

  return {
    ok: true,
    created: true,
    full_name: res.data.full_name,
    html_url: res.data.html_url,
  };
}

export function assertOrgRepo(repo: string): void {
  const normalized = normalizeRepoName(repo);
  if (!normalized) {
    throw new GitHubIssueRequestError("repo name required", 400, {});
  }
}
