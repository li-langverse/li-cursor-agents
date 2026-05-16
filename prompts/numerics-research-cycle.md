# Automation prompt: Numerics research cycle (Cursor agent)

**This is a Cursor Agent run** — not a GitHub Action. You must use **web search** for SOTA (papers, Eigen/Kokkos/PETSc docs, recent HPC posts). Local scripts only produce bench JSON.

Run a **structured numerics research pass** on red/near-limit **physics** or **micro** rows, or on an open issue labeled `numerics-research` / `novel-algorithm`.

**Skills:** `research-li-numerics`, `numerics-autoresearch` (if proposing new methods)  
**Methodology:** `docs/numerics/research-methodology.md`  
**Dashboard:** https://li-langverse.github.io/benchmarks/  
**Preflight:** `./scripts/agent-preflight.sh` or `ecosystem-audit.py` + `benchmark-failures-report.sh`

**Do not** add Actions `cron:`. **Do not** weaken catalog thresholds. **Do not** self-merge.

---

## 1. Align with org

Read:

- [ecosystem-first.md](../../docs/ecosystem/ecosystem-first.md)
- [vision-and-roadmap](https://github.com/li-langverse/roadmap/blob/main/docs/ecosystem/vision-and-roadmap.md) — PH-5b, PH-7e
- Skill **`li-ecosystem-discipline`**

---

## 2. Pick target

```bash
cd benchmarks
./scripts/benchmark-failures-report.sh
cat data/latest/summary.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d.get('rows',[]):
    if r.get('category')=='physics' or 'horner' in r.get('benchmark',''):
        if r.get('status') in ('red','yellow') or (r.get('ratio_vs_cpp') or 0)>1.0:
            print(r['status'], r['benchmark'], r.get('ratio_vs_cpp'))
"
```

Or take assigned GitHub issue / PH id from lic master plan.

---

## 3. SOTA survey (Mode A — always)

For the target kernel:

1. Survey **numerical recipes** + **reference implementations** (papers, PETSc/Eigen-style patterns, org `common/*_core.c`)
2. Document **2–4 Learned from** references
3. State stability limits (CFL, symplectic choice, etc.)

If SOTA adoption is insufficient for PH goals → continue to **§4 Autoresearch**; else implement best SOTA path.

---

## 4. Autoresearch (Mode B — optional)

Only if SOTA cannot meet goals:

1. Propose novel method with discrete equations in `docs/numerics/algorithms/<slug>.md`
2. Run **`numerics-evidence-checklist.py --novel`**
3. Label PR `novel-algorithm`

---

## 5. Evidence pack (required)

```bash
LIC_ROOT=../lic ./scripts/render-benchmark-visuals.sh
./scripts/benchmark-failures-report.sh
```

Write `docs/numerics/studies/YYYY-MM-DD-<slug>.md` with:

- Quality table (stability / speed / accuracy — before vs after)
- Exact repro commands
- Links to PNG/GIF/zip (raw GitHub URLs)
- Vision notes (3–6 bullets) per benchmark-visual-validation heuristics

```bash
python3 scripts/numerics-evidence-checklist.py --study docs/numerics/studies/YYYY-MM-DD-slug.md [--novel ...]
```

---

## 6. Deliverable

Open **lic** PR (implementation) + link study in PR body. If catalog row changes, **benchmarks** PR for `catalog.toml` + ingest.

**Output format:**

1. **Mode:** SOTA survey only | Autoresearch  
2. **Target bench ids** + dashboard status  
3. **Verdict:** improvement on which axes; any regression risk  
4. **Study + algorithm note paths**  
5. **Download links** to top plots/animations  
6. **Follow-up:** human math review needed? (yes for `--novel`)

---

## 7. Stop

- No lic checkout → BLOCKED; file **ecosystem-gap** if harness missing  
- Checklist FAIL → do not claim ready for merge  
- Do not merge own PRs
