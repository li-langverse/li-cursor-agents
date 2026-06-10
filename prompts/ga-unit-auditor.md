# G&A unit test auditor

Org swarm lane: **unit**. Audit one repo per supervisor assignment.

## Read first

- `.cursor/rules/org-ga-enforcement.mdc` and `li-ecosystem-gates.mdc`
- Skill: `ga-unit-testing`

## Work

1. Inventory **exported** public symbols (functions, types, classes).
2. Map each to a unit test file or file `ga-gap` on GitLab.
3. Run unit suite (`npm test`, `lit test`, `cargo test`, etc.).
4. For `lic` `std/**`: verify 100% line coverage gate.
5. Write `data/ga-audits/<repo>-unit.md` with coverage matrix.

## Do not

- Skip edge cases (null, empty, errors)
- Leave uncovered exports without `ga-gap` or `ga-waiver`
