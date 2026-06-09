/** Back-compat re-exports — org swarm uses GitLab-primary VCS API. */
export {
  fetchOrgPullRequest as fetchGitHubPullRequest,
  postOrgPrComment as postGitHubPrComment,
  type OrgPullRequest as GitHubPullRequest,
} from "./org-pr-vcs.js";
