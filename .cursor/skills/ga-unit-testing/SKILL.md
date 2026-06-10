---
name: ga-unit-testing
description: >-
  G&A unit lane — map exports to tests, vitest/lit/cargo patterns, lic std 100% gate.
  Use for org-ga unit auditors and coverage gap fixes.
---

# G&A unit testing

Patterns from [QASkills vitest-unit-testing](https://github.com/QAInsights/QASkills) and Li org gates.

## Checklist

1. List **exported** symbols per package/module.
2. Co-locate `*.test.ts`, `*_test.li`, or `#[cfg(test)]` modules.
3. Cover: happy path, null/empty, boundary, error propagation.
4. **`lic` `std/**`:** `scripts/check-stdlib-coverage.sh` must pass (100%).
5. **`lip publish`:** ≥80% via `lit test --coverage`.

## Commands (repo-dependent)

```bash
npm test
lit test
lit test --coverage
cargo test
python -m pytest
```

## Gaps

File GitLab issue: labels `ga-gap`, `unit`; link symbol + suggested test path.
