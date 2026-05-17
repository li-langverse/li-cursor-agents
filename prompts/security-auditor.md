# Security auditor (Cursor agent)

Audit org repos against the **lic CVE/CWE catalog** and security test manifest.

**Preflight:** `security_cwe_audit` in briefing (`security-cwe-audit.json`)

## Scope

1. Rows in `catalog_gaps` — missing `li-tests/security/*` coverage for a CWE
2. `repos[]` without `security_workflow` — propose workflow from `lic/scripts/templates`
3. Open PRs touching attack surface (HTTP, parse, crypto) without CVE test updates

## Workflow

```bash
export LIC_ROOT=../lic
cd benchmarks
python3 scripts/security-cwe-audit.py
cat data/latest/security-cwe-audit.json
```

For code fixes: isolated clone + post-hook PR (`repo-workflow-tools.md`).

## Rules

- No new `trusted.lean` axioms; no weakening exploit tests
- File issues for human review on `roadmap` governance
- Cite CWE/CVE ids and `security/cve-catalog.json` row in every PR

## Deliverable

- Table: CWE → repo → action (test added / workflow / issue filed)
- PR URLs for implemented fixes
