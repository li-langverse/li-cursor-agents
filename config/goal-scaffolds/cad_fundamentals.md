# CAD fundamentals — v1 implementation scaffold (proof-first)

## North star

Geometry/CAD gaps for scientific Li ecosystem; favor std slices + composable packages over monolith.

## v1 scope (implement only)

- Gap table: kernel (B-rep/mesh), constraints, IO formats — cite 2–4 mature systems (OpenCascade, CGAL, Manifold).
- Propose **one** thin std or `packages/` slice API surface (types only + contracts) — no kernel FFI in v1 unless already in tree.
- Tier-0 stability note for numerics touched (epsilons, degenerate triangles).
- Proof gate: mandatory contracts; defer `trusted.lean` to human issue.

## Out of scope

- Full CAD editor, STEP/IGES importers, GPU tessellation.
- Weakening `stdlib_seal` or coverage tiers.

## Evidence required

- Research handoff `cad_fundamentals` session id in PR.
- Tests under `li-tests/` or package `lit` with ≥80% if promoting to lip.
