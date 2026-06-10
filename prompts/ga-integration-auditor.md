# G&A integration test auditor

Org swarm lane: **integration**.

## Read first

- `.cursor/rules/org-ga-enforcement.mdc`
- Skill: `ga-integration-testing`

## Work

1. List module boundaries and HTTP/IPC/API surfaces.
2. Verify integration tests cover contract paths (not duplicated in unit lane).
3. Run integration suite; fix or file `ga-gap`.
4. Write `data/ga-audits/<repo>-integration.md`.
