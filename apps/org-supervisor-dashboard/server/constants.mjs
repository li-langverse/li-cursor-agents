/** @typedef {'issue' | 'pr' | 'review' | 'research'} SupervisorKind */

export const KINDS = /** @type {const} */ (["issue", "pr", "review", "research"]);

export const META = {
  issue: {
    label: "Issue implementer",
    deployment: "li-org-issue-supervisor",
    activeFile: "org-issue-active.json",
    auditKey: "issue",
    auditFile: "org-issue-implement-audit.jsonl",
    queueFile: "org-issue-queue.json",
    countScript: "org-issue-open-count.py",
    openCountPattern: /open_issues=(\d+)/,
    kubectlLogs:
      'kubectl -n li-swarm logs deploy/li-org-issue-supervisor -f --tail=100',
    kubectlJobs:
      'kubectl -n li-swarm get jobs -l li-langverse.io/org-issue',
  },
  pr: {
    label: "PR implementer",
    deployment: "li-org-pr-supervisor",
    activeFile: "org-pr-active.json",
    auditKey: "pr-implement",
    auditFile: "org-pr-implement-audit.jsonl",
    queueFile: "org-pr-merge-queue.json",
    countScript: "org-pr-open-count.py",
    openCountPattern: /open_prs=(\d+)/,
    kubectlLogs:
      'kubectl -n li-swarm logs deploy/li-org-pr-supervisor -f --tail=100',
    kubectlJobs:
      'kubectl -n li-swarm get jobs -l li-langverse.io/org-pr-implementer',
  },
  review: {
    label: "PR reviewer",
    deployment: "li-org-reviewer-supervisor",
    activeFile: "org-pr-active.json",
    auditKey: "pr-review",
    auditFile: "org-pr-review-audit.jsonl",
    queueFile: "org-pr-merge-queue.json",
    countScript: "org-pr-open-count.py",
    openCountPattern: /open_prs=(\d+)/,
    kubectlLogs:
      'kubectl -n li-swarm logs deploy/li-org-reviewer-supervisor -f --tail=100',
    kubectlJobs:
      'kubectl -n li-swarm get jobs -l li-langverse.io/org-pr-reviewer',
  },
  research: {
    label: "Researcher",
    deployment: "li-org-research-supervisor",
    activeFile: "org-research-active.json",
    auditKey: "research",
    auditFile: "org-research-audit.jsonl",
    queueFile: "org-research-dimensions.json",
    countScript: null,
    openCountPattern: null,
    kubectlLogs:
      'kubectl -n li-swarm logs deploy/li-org-research-supervisor -f --tail=100',
    kubectlJobs:
      'kubectl -n li-swarm get jobs -l li-langverse.io/managed-by=org-research-supervisor',
  },
};

export const MAX_WORKERS = 3;
export const OPEN_PER_WORKER = 50;

export function computeDesiredWorkers(openCount) {
  if (openCount <= 0) return 0;
  return Math.min(MAX_WORKERS, Math.max(1, Math.ceil(openCount / OPEN_PER_WORKER)));
}
