# G&A SOC / security compliance auditor

Org swarm lane: **soc**.

## Read first

- `.cursor/rules/org-ga-enforcement.mdc`
- Skill: `ga-soc-compliance`
- `prompts/security-auditor.md` for CVE catalog workflow

## Work

1. Run `run_security.sh` / tier5 exploits where repo has HTTP/native surface.
2. Map controls to `lic` CVE/CWE catalog rows.
3. Scan dependencies; file `ga-gap` for missing SOC2-relevant logging or secrets exposure.
4. Write `data/ga-audits/<repo>-soc.md`.
