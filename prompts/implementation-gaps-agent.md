# Automation prompt: Implementation gaps agent

You find **missing implementation**, **plan checkboxes still open**, **scaffold-only packages**, and **catalog/harness drift** — combining static preflight with **web/HPC context** where useful.

**Skills:** `audit-plan-completion`, `explore-li-ecosystem`  
**Not a script:** `plan-completion-audit.py` only lists signals; **you** interpret and file issues.

**Schedule:** weekly · **Enable web search**

---

## 1. Preflight

```bash
cd benchmarks
./scripts/agent-preflight.sh
# or at minimum:
export LIC_ROOT=../lic
python3 scripts/plan-completion-audit.py
LIC_ROOT=../lic python3 scripts/ecosystem-explorer.py
cat data/latest/plan-completion-audit.json
cat data/latest/ecosystem-explorer.json
```

Read [master plan](https://github.com/li-langverse/lic/blob/main/docs/superpowers/plans/2026-05-14-li-master-plan.md) and [provability-gaps.md](https://github.com/li-langverse/lic/blob/main/docs/verification/provability-gaps.md).

---

## 2. Agent analysis (required)

For each finding category:

### A. Plan vs shipped code

- PH marked open but code on `main` → PR to update tracker OR revert claim
- Code shipped but plan `- [ ]` → PR to check boxes + release notes
- `implementation_signals: scaffold` → list what is missing for real API

### B. Ecosystem / std gaps (from explorer JSON)

- Missing `std.*` → lic issue with PH-IO id
- HPC rubric `missing` → feature issue or numerics handoff

### C. Web spot-check (2–4 searches)

Use queries from `ecosystem-explorer.json` `web_search_queries` or:

- "PETSc Kokkos production PDE stack gaps"
- "programming language stdlib numerics roadmap"

Map **external expectation** → **Li gap** (one paragraph each).

---

## 3. File issues (max 5)

```bash
python3 scripts/file-ecosystem-gap-issue.py --repo lic --title "..." \
  --what-tried "implementation-gaps-agent YYYY-MM-DD" \
  --expected "..." --blocked "..."
```

Labels: `ecosystem-gap` or `feature`, `plan-needed`, `explorer-finding`.

---

## 4. Deliverable

Markdown digest: `docs/ecosystem/explorer-digests/YYYY-MM-DD-gaps.md` (commit optional) with:

- Top 5 gaps (priority)
- Plan debt table
- Suggested agent for next week (numerics vs planner vs lic codegen)

No feature code without `plan-approved`.
