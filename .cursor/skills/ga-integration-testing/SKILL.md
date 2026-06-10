---
name: ga-integration-testing
description: >-
  G&A integration lane — API/module boundary tests, fixtures, contract verification.
  Use for org-ga integration auditors.
---

# G&A integration testing

Patterns from [QASkills api-testing-patterns](https://github.com/QAInsights/QASkills).

## Scope

- Cross-module calls (not single-function unit tests)
- HTTP handlers with test server / mock upstream
- DB or filesystem I/O with temp fixtures
- Message-passing between services

## Checklist

1. One integration test per **public integration surface**.
2. Fixtures mirror production schema/version.
3. No live network in unit lane — integration owns I/O.
4. CI job runs integration suite on MR.

## Gaps

GitLab `ga-gap` + `integration` with contract id and fixture path.
