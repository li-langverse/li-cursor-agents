# Org issue zero sprint

Clear open GitHub **issues** in `li-langverse` with auditable close reasons.

## Quick start

```bash
cd li-cursor-agents
export GH_TOKEN=...   # .env.github

python scripts/org-issue-open-count.py
python scripts/org-classify-open-issues.py
python scripts/org-issue-queue-summary.py
```

Goal file: `data/goal-directed-sprints/org-issue-zero.md`  
Agent prompt: `prompts/org-issue-triage-agent.md`  
Close audit: `data/goal-directed-sprints/org-issue-close-audit.jsonl`

## Launch goal-directed sprint

```bash
./scripts/goal-directed-loop.sh \
  --goal-file data/goal-directed-sprints/org-issue-zero.md \
  --workflow-repo li-cursor-agents
```

## Analyze closures

```bash
# Each line is JSON: repo, number, reason, summary, evidence, closed_at
cat data/goal-directed-sprints/org-issue-close-audit.jsonl
```

Every closed issue also has a comment table (`reason_code`, `summary`, `evidence`) on GitHub.

## Kubernetes (engine cluster)

See [deploy/k8s/engine/README.md](../../deploy/k8s/engine/README.md). CronJob li-org-issue-worker every 30 minutes on nodes labeled li-langverse.io/node-pool=engine.
