---
workflow_repo: lic
branch: cursor/li-parallel-native-hpc
plan: lic/data/goal-directed-sprints/li-parallel-killer-plan.md
---

# li-parallel killer package — K8s worker pointer

Canonical goal: **`lic/data/goal-directed-sprints/li-parallel-killer-package.md`**

## Progress gate

```bash
bash scripts/check-li-parallel-full-suite.sh
```

## Completion gate (engineering + proofs 100%)

```bash
bash scripts/check-li-parallel-goal-complete-gate.sh
```

Phases 0–99 **DONE**; Phase 10 (proofs 100%) **PENDING**. Worker uses `LI_GOAL_SELF_UNBLOCK=1`, scales to 0 on `GOAL_COMPLETE`.
