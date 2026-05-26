# Offensive security — implementation scaffold

## North star

Close CWE/catalog gaps and tier5 exploit rows with **li stricter-or-equal** vs nginx; fuzz coverage documented; no weakening `li_stricter` or exploit tests.

## v1 scope (implement only)

- One backlog todo from `security-research-backlog.md` per iteration.
- Study under `docs/security/studies/` with CWE/CVE citations and tier5 row mapping.
- `li-tests/security/*` or tier5 `exploits/*.toml` when attack surface changes.

## Out of scope

- Disabling security gates or lowering exploit expectations.
- Product features unrelated to security posture.

## Evidence required

- **Whitepaper** in `research-findings/whitepapers/YYYY-MM/offensive_security/<slug>/` (skill `publish-research-whitepaper`).
- Research study linked in PR and whitepaper `links`.
- `./scripts/security-research-gates.sh` green (or study-only path documented).
- Handoff to `code_implementer` for multi-package fixes; `issue_planner` for roadmap-only items.
