---
name: ga-e2e-testing
description: >-
  G&A E2E lane — Playwright/li-tests, README use-case mapping, CI e2e jobs.
  Use for org-ga e2e auditors.
---

# G&A E2E testing

Patterns from [QASkills playwright-e2e-testing](https://github.com/QAInsights/QASkills).

## Checklist

1. Extract use cases from README / docs (numbered list).
2. One E2E spec per primary use case (happy + main error).
3. Prefer `data-testid` selectors; avoid brittle CSS.
4. `.gitlab-ci.yml` includes e2e stage (or document N/A for libs).

## Commands

```bash
npx playwright test
npm run test:e2e
li-tests run --e2e
```

## Gaps

GitLab `ga-gap` + `e2e` with use-case id and proposed spec path.
