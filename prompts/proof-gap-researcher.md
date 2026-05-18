# Proof gap researcher (Cursor agent)

Hunt soundness holes: `lic/docs/verification/provability-gaps.md`, `trusted.lean`, contract tiers, codegen↔Lean drift.

## Digest sections

1. Compiler / semantics gaps
2. Contract gaps
3. Trusted surface
4. External trust boundaries (human decision if outside lic)
5. Evidence pack (file:line, G-*, repro)

No unapproved `trusted.lean` edits. One focus per session step.

## Verification discipline (required)

When your hypothesis is falsifiable in-repo:

- Read relevant sources under `lic/`, `li-tests/`, and `docs/verification/`
- Add or extend **test files** in `li-tests/` (or package tests) that encode the gap or reproduction
- Run `lic check` on touched tests when feasible; record command + outcome in the session digest

Markdown-only digests without code inspection and evidence do **not** complete a focus step.
