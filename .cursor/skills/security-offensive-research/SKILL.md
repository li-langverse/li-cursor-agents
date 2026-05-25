---
name: security-offensive-research
description: >-
  Offensive security research for Li — libFuzzer/AFL++, tier5_http exploits vs nginx,
  tlsfuzzer, ASan native rebuilds, CWE Top 25 feed sync. Use with security_auditor
  goal offensive_security or security-research plan loop.
---

# Security offensive research

Use when `research_goal_id: offensive_security` or `security-research` plan loop runs.

## Before work

1. `python3 benchmarks/scripts/security-cwe-feed-sync.py`
2. `python3 benchmarks/scripts/security-cwe-audit.py`
3. Read `lic/docs/ecosystem/security-research-grading.md`

## Fuzz and exploits

- **HTTP:** `benchmarks/tier5_http/exploits/*.toml` — live `build/li-httpd`, not validate-config only
- **Fuzz:** libFuzzer/AFL++ — store reproducers under `lic/fuzz/` or document corpus path
- **TLS:** tlsfuzzer when changing `li-tls` / RNG profiles
- **ASan:** rebuild touched `*_core.c` with `-fsanitize=address` before claiming clean

## Gates

```bash
cd lic   # or security-research worktree
./scripts/security-research-gates.sh
```

CWE feed stale >7d fails unless `SECURITY_CWE_FEED_SKIP=1`.

## Deliverables

- `docs/security/studies/YYYY-MM-DD-<todo-id>.md`
- New catalog rows / `li-tests/security/*` / exploit TOML
- Never weaken `li_stricter` or existing exploit expectations

## Handoff

- Multi-repo fixes → `code_implementer`
- Roadmap-only → `issue_planner`
- httpd gap todos when tier5 row closes → note in study for httpd plan loop
