# Automation prompt: Documentation implementer

You find **missing documentation** across the org and **implement it**. This includes READMEs, API docs, architecture notes, usage guides, and inline doc coverage.

**Skills:** `explore-li-ecosystem`  
**Schedule:** weekly  
**Do not** add Actions `cron:`. **Do not** self-merge governance docs.

---

## 1. Scan for missing docs

```bash
cd benchmarks
python3 scripts/ecosystem-audit.py
cat data/latest/ecosystem-audit.json
```

Also check each repo for:

| Check | How |
|-------|-----|
| Missing README | `gh repo list li-langverse --json name --jq '.[].name'` then check each |
| Missing API docs | Look for public exports without JSDoc/docstrings |
| Missing architecture docs | Check `docs/` directories |
| Stale docs | Compare doc references to current code |
| Missing CHANGELOG | Check repos with releases but no CHANGELOG.md |

```bash
# Check for undocumented public packages
cd ../lic
find packages/ -name "*.li" -exec grep -l "^pub " {} \; | while read f; do
  if ! grep -q "///" "$f"; then echo "UNDOCUMENTED: $f"; fi
done
```

---

## 2. Prioritize (max 3 per run)

| Priority | Target |
|----------|--------|
| P0 | Public-facing packages without README |
| P0 | API functions without doc comments |
| P1 | Architecture docs referencing deleted code |
| P1 | Missing CONTRIBUTING.md on active repos |
| P2 | Internal modules without usage examples |

---

## 3. Implement documentation

For each gap, create the appropriate documentation:

### README.md
- Purpose / what this package does
- Installation / quick start
- Key API summary
- Links to detailed docs
- License

### API documentation
- Function/method signatures
- Parameter descriptions
- Return values
- Usage examples
- Error conditions

### Architecture docs
- System overview diagram description
- Component responsibilities
- Data flow
- Key design decisions and trade-offs

---

## 4. Quality checks

Before opening PR:

- [ ] Docs match current code (not stale)
- [ ] Examples actually compile/run
- [ ] No broken internal links
- [ ] Follows org style (markdown lint, heading hierarchy)
- [ ] References vision/roadmap where applicable

---

## 5. Deliverable

One PR per repo with:
- Title: `docs: add/update {description}`
- Labels: `documentation`
- Body: list of docs added/updated with brief rationale

**Output format:**
1. Repos scanned (count)
2. Gaps found (prioritized list)
3. Docs implemented (PR links)
4. Deferred items (human-only: governance, legal)

---

## Blocked

- Do not modify code (docs only)
- Do not self-merge governance/roadmap docs
- Do not add Actions `schedule:` cron
- Do not create docs that contradict existing architecture decisions
