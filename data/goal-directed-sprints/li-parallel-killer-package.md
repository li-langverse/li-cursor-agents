---
workflow_repo: lic
branch: cursor/li-parallel-native-hpc
plan: lic/data/goal-directed-sprints/li-parallel-killer-package.md
---

# li-parallel killer package — K8s worker pointer

Canonical goal: **`lic/data/goal-directed-sprints/li-parallel-killer-package.md`**

## Progress gate

```bash
bash scripts/check-li-parallel-full-suite.sh
```

## Completion gate

```bash
bash scripts/check-li-parallel-killer-gate.sh
```

Phases 0–4 partial foundation landed; Phases 5–99 pending. Do not weaken gates. `LIPAR_KILLER_SKIP_FULL` removed.
