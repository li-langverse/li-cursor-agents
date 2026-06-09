/** Git remote + MR/PR provider (GitLab primary per org policy). */

export type VcsProvider = "gitlab" | "github";

export const DEFAULT_ORG = "li-langverse";

export function vcsProvider(): VcsProvider {
  const raw = process.env.LI_VCS_PROVIDER?.trim().toLowerCase();
  return raw === "github" ? "github" : "gitlab";
}

export function gitlabHost(): string {
  return process.env.LI_GITLAB_HOST?.trim() || process.env.LI_GIT_HOST?.trim() || "gitlab.lilangverse.xyz";
}

export function gitlabGroup(): string {
  return process.env.LI_GITLAB_GROUP?.trim() || process.env.LI_GIT_GROUP?.trim() || DEFAULT_ORG;
}

export function githubOrg(): string {
  return process.env.GH_ORG?.trim() || process.env.LI_GITHUB_ORG?.trim() || DEFAULT_ORG;
}

export function gitAuthToken(): string | undefined {
  if (vcsProvider() === "github") {
    return process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  }
  return process.env.GITLAB_TOKEN?.trim();
}

export function hasGitAuthToken(): boolean {
  return Boolean(gitAuthToken());
}

export function primaryCloneUrl(org: string, repo: string): string {
  if (vcsProvider() === "github") {
    return `https://github.com/${org}/${repo}.git`;
  }
  return `https://${gitlabHost()}/${gitlabGroup()}/${repo}.git`;
}

export function githubMirrorUrl(repo: string): string {
  return `https://github.com/${githubOrg()}/${repo}.git`;
}
