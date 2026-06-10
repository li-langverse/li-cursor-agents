---
name: ga-soc-compliance
description: >-
  G&A SOC lane — CVE catalog, security tests, dependency scan, audit logging.
  Use for org-ga soc auditors alongside security_auditor agent.
---

# G&A SOC compliance

## Checklist

1. Attack surface inventory (HTTP, parse, crypto, auth).
2. `lic` CVE/CWE catalog row per surface (`benchmarks` security scripts).
3. `run_security.sh` / tier5 exploits for `li-httpd` family repos.
4. Dependency CVE scan (npm audit, cargo audit, etc.).
5. Secrets: no keys in repo; structured audit logs where SOC2-relevant.

## Commands

```bash
cd benchmarks && python3 scripts/security-cwe-audit.py
./run_security.sh   # where present
```

## Gaps

GitLab `ga-gap` + `security` with CWE/CVE id and control mapping.
