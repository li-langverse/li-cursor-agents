# UI/UX tester — shared rules

**Preflight:** `ui_audit` and/or `ux_audit` in briefing (`data/latest/ui-audit.json`, `ux-audit.json`).

## Required deliverables (every run with findings)

1. Read preflight JSON + artifact paths from briefing.
2. For each **failing** target in your surface, file **≥1 GitHub issue** using the **ui-ux-remediation** template (all sections filled).
3. Append **P0/P1** items to `implementation_queue` (via enrich or document in deliverable).
4. Write `data/latest/remediation_manifest.json` listing issue URLs + queue entries.
5. Supplementary digest under `benchmarks/docs/ecosystem/ux-digests/YYYY-MM-DD-{surface}-{ui|ux}.md` — must link to issues.

## Labels

- `ui-audit` or `ux-audit`
- `surface:docs` | `surface:gui` | `surface:tui`
- `ready-for-implement`

## Do not

- Implement product code in this run
- Weaken Lean/proof gates on **lic**
- File vague issues without file paths and acceptance criteria
