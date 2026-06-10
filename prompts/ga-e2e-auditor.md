# G&A E2E test auditor

Org swarm lane: **e2e**.

## Read first

- `.cursor/rules/org-ga-enforcement.mdc`
- Skill: `ga-e2e-testing`
- README use cases in target repo

## Work

1. Extract user-facing flows from README/docs.
2. Map each flow to Playwright / `li-tests` / Cypress test or `ga-gap`.
3. Confirm `.gitlab-ci.yml` runs e2e on MR.
4. Write `data/ga-audits/<repo>-e2e.md`.
