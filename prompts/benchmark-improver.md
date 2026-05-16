# Automation prompt: Benchmark improver

**This is a Cursor Agent run** — uses **web search** for SOTA implementations and optimization techniques. You find benchmarks where Li is **not the best** and systematically improve performance until Li matches or exceeds peers.

Unlike the numerics researcher (SOTA survey) and autonomous researcher (novel algos), **you focus on practical optimization** — making existing Li code faster through better codegen, vectorization, memory layout, algorithm selection, and compiler hints.

**Skills:** `research-li-numerics`, `explore-li-ecosystem`  
**Dashboard:** https://li-langverse.github.io/benchmarks/  
**Do not** add Actions `cron:`. **Do not** weaken thresholds. **Do not** self-merge.

---

## 1. Identify underperforming benchmarks

```bash
cd benchmarks
./scripts/benchmark-failures-report.sh
cat data/latest/summary.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
targets = []
for r in d.get('rows',[]):
    ratio = r.get('ratio_vs_cpp', 0)
    if ratio > 1.05:  # Li is >5% slower than C++
        targets.append((ratio, r['benchmark'], r.get('category',''), r.get('status','')))
targets.sort(reverse=True)
for ratio, bench, cat, status in targets[:10]:
    print(f'{status:6} {bench:40} ratio={ratio:.2f} ({cat})')
"
```

---

## 2. Diagnose root cause

For each target benchmark, determine WHY Li is slower:

| Possible cause | How to check |
|----------------|-------------|
| Missing SIMD/vectorization | Check ASM output, look for scalar loops |
| Poor memory layout | Check cache misses, AoS vs SoA |
| Suboptimal algorithm choice | Compare against best-known complexity |
| Compiler missed optimization | Check IR, compare with `-O3` C++ |
| Unnecessary allocations | Profile heap usage |
| Missing parallelism | Check if embarrassingly parallel but serial |

```bash
cd ../lic
# Build with profiling
./scripts/build.sh --profile
# Run specific bench with instrumentation
./scripts/bench.sh <bench_id> --flamegraph
```

---

## 3. Research best practices (web)

Search for optimization techniques specific to the domain:

- `"<algorithm> SIMD optimization" OR "vectorization"`
- `"<domain> cache-friendly" memory layout`
- `"<library>" implementation tricks` (e.g., FFTW, Intel MKL, Eigen tricks)
- `site:agner.org` for CPU optimization manuals
- Recent compiler papers on auto-vectorization

---

## 4. Implement improvement

Apply one or more optimization strategies:

1. **Algorithm-level** — better asymptotic complexity, fewer passes
2. **Data-level** — SoA layout, alignment, prefetching hints
3. **Instruction-level** — SIMD intrinsics, FMA, branchless code
4. **Compiler-level** — better annotations, `restrict`, `inline` hints
5. **Parallelism** — OpenMP/task parallelism for large inputs

Implement in **lic** as focused PR.

---

## 5. Validate improvement

```bash
cd benchmarks
LIC_ROOT=../lic ./scripts/render-benchmark-visuals.sh
./scripts/benchmark-failures-report.sh

# Compare before/after
python3 -c "
# Check the specific benchmark improved
import json
d = json.load(open('data/latest/summary.json'))
for r in d.get('rows',[]):
    if r['benchmark'] == '<target>':
        print(f\"ratio: {r['ratio_vs_cpp']:.3f} (target: <1.05)\")
"
```

**Must show:**
- ratio_vs_cpp improved (closer to or below 1.0)
- No regression on other benchmarks
- Stability/correctness preserved

---

## 6. Deliverable

Open **lic** PR:
- Title: `perf: improve {benchmark} by {approach}`
- Labels: `performance`, `benchmark`
- Body includes:
  - Before/after ratios
  - Root cause diagnosis
  - Optimization technique applied
  - Evidence (benchmark output, flamegraph if relevant)

**Output format:**

```markdown
# Benchmark Improvement Report — {date}

## Targets
| Benchmark | Before (ratio) | After (ratio) | Improvement | Technique |
|-----------|----------------|---------------|-------------|-----------|
| ... | 1.45 | 0.98 | 32% faster | SIMD + SoA |

## Approach
- Root cause: ...
- Solution: ...
- References: ...

## Regressions
- None / list any

## Follow-up
- Further optimization possible: yes/no
- Handoff to autonomous_researcher needed: yes/no (if novel method required)
```

---

## Blocked

- Do not weaken `threshold_ratio_cpp` in catalog
- Do not sacrifice correctness for speed
- Do not self-merge performance PRs (need benchmark validation)
- If >20% improvement not achievable with practical optimization, hand off to `autonomous_researcher` for novel method design
