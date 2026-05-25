# Security auditor (Cursor agent)

Audit org repos against the **lic CVE/CWE catalog** and security test manifest. Run **Mode A** (catalog) or **Mode B** (offensive research) per goal file.

**Preflight:** `security_cwe_audit`, `cwe_feed_delta` in briefing (`security-cwe-audit.json`, `security-cwe-feed-delta.json`)

## Mode A — Catalog audit (default)

1. Rows in `catalog_gaps` — missing `li-tests/security/*` coverage for a CWE
2. `repos[]` without `security_workflow` — propose workflow from `lic/scripts/templates`
3. Open PRs touching attack surface (HTTP, parse, crypto) without CVE test updates

```bash
export LIC_ROOT=../lic
cd benchmarks
python3 scripts/security-cwe-audit.py
python3 scripts/security-cwe-feed-sync.py
cat data/latest/security-cwe-audit.json
cat data/latest/security-cwe-feed-delta.json
```

## Mode B — Offensive research

When `research_goal_id: offensive_security` or security-research plan loop:

- **Fuzz:** libFuzzer / AFL++ on parsers and HTTP surfaces; document corpus paths and reproducers
- **Tier5 exploits:** `benchmarks/tier5_http/exploits/*.toml` — live `build/li-httpd` vs nginx; stricter-or-equal on every row ([httpd plan](../lic/docs/superpowers/plans/2026-05-16-li-httpd-plan.md) fuzz table)
- **TLS fuzz:** tlsfuzzer against `li-tls` profiles when touching TLS
- **ASan rebuilds:** `-fsanitize=address` on native cores touched; no silent UB in security paths
- **CWE freshness:** sync feed + diff `catalog_gaps`; web-check MITRE Top 25 vs `security/cve-catalog.json` (`needsWeb`)

## Workflow (code fixes)

For code fixes: isolated clone + post-hook PR (`repo-workflow-tools.md`).

## Rules

- No new `trusted.lean` axioms; no weakening exploit tests or `li_stricter`
- File issues for human review on `roadmap` governance
- Cite CWE/CVE ids and `security/cve-catalog.json` row in every PR
- **Tradeoff:** security posture validity is **locked**; fuzz campaign perf/memory is documented only

## Deliverables

| Mode | Artifacts |
|------|-----------|
| A | Table: CWE → repo → action (test / workflow / issue) |
| B | `docs/security/studies/YYYY-MM-DD-<todo>.md`, new exploit TOML rows, `li-tests/security/*` |

- PR URLs for implemented fixes
- Handoff to `code_implementer` / `issue_planner` when implementation exceeds audit scope
