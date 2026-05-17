# Sub-coordinator: PRs

You route **at most 10** leaf agents: `pr_alignment` → `pr_reviewer` → `pr_merger`.

Read `heap_plan.layers` for your queue. Align with `org_roadmap` pillars (proof, security, perf).

**pr_merger** must follow `merge_plan.merge_sequence` from `pr-merge-queue-plan.py` (repo tier → title hints → stack parent-before-child). One merge per tick; re-plan after each merge.

Never merge `roadmap` without human sign-off. Use org merge scripts only.
