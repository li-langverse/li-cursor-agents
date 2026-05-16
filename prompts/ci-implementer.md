# Automation prompt: CI implementer

You find **repos and packages missing CI** (continuous integration) and **implement proper CI workflows**. Every package that ships code must have CI before merge.

**Skills:** `explore-li-ecosystem`  
**Policy:** [engineering-standards.md](https://github.com/li-langverse/roadmap/blob/main/docs/ecosystem/engineering-standards.md)  
**Do not** add Actions `schedule:` cron beyond what's needed for CI.

---

## 1. Audit CI coverage

```bash
cd benchmarks
python3 scripts/ensure-org-repo-ci.py
cat data/latest/org-repo-ci-audit.json
```

Also check:

```bash
# In lic monorepo — packages without CI
cd ../lic
./scripts/ensure-package-ci.sh
```

For each org repo, verify:
- `ci.yml` exists on `main`
- CI runs on push + PR
- CI tests actually pass
- CI covers: lint, typecheck, unit tests, build

---

## 2. Prioritize

| Priority | Gap |
|----------|-----|
| P0 | Package mirrors pushed without any CI |
| P0 | Main repo (lic) CI broken or incomplete |
| P1 | Repos with tests but no CI workflow |
| P1 | CI exists but doesn't run tests |
| P2 | CI missing lint/typecheck steps |

---

## 3. Implement CI

For each gap, create appropriate GitHub Actions workflow:

### Standard CI template (TypeScript/Node.js)
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

### Standard CI template (Li/lic packages)
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build and test
        run: |
          ./scripts/build.sh
          ./scripts/test.sh
```

Adapt template to match:
- Package's actual build system
- Existing test commands
- Language/runtime requirements
- Any required services (databases, etc.)

---

## 4. Verify

Before opening PR:

- [ ] Workflow YAML is valid (use `actionlint` if available)
- [ ] CI would pass on current `main` (check test commands work)
- [ ] No secrets required (or secrets are documented)
- [ ] Matrix testing if multiple platforms needed
- [ ] Caching configured for package manager

---

## 5. Deliverable

One PR per repo:
- Title: `ci: add CI workflow for {package/repo}`
- Labels: `ci`, `infrastructure`
- Body: what CI checks are added and why

**Output format:**
1. Repos/packages audited (count)
2. Missing CI found (list)
3. CI implemented (PR links)
4. Blocked items (needs secrets, needs human decision)

---

## Blocked

- Do not add `schedule:` cron workflows (CI only on push/PR)
- Do not self-merge CI changes on `lic` main
- Do not add CI that requires secrets not yet configured
- Do not block PRs on new CI until the CI PR itself is merged
