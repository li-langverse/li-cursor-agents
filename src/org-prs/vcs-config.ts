/** VCS provider for org-swarm PR workers (GitLab primary). */

export type VcsProvider = "gitlab" | "github";

export function vcsProvider(): VcsProvider {
  const raw = process.env.LI_VCS_PROVIDER?.trim().toLowerCase();
  return raw === "github" ? "github" : "gitlab";
}

export function gitlabHost(): string {
  return process.env.LI_GITLAB_HOST?.trim() || "gitlab.lilangverse.xyz";
}

export function gitlabGroup(): string {
  return process.env.LI_GITLAB_GROUP?.trim() || "li-langverse";
}

export function vcsToken(): string | undefined {
  if (vcsProvider() === "github") {
    return process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  }
  return process.env.GITLAB_TOKEN?.trim();
}

export function vcsLabel(): string {
  return vcsProvider() === "gitlab" ? "GitLab MR" : "GitHub PR";
}
