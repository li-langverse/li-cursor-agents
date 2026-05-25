# Game engine UX — v1 implementation scaffold (proof-first)

## North star

Easy Li APIs for interactive loops + AI agent hooks; no `unsafe`; contracts on public `proc`.

## v1 scope (implement only)

- Document target package placement (`packages/` vs `std/`) in handoff digest — do not create official org repo without `PKG-*` approval.
- Spike: minimal window/input loop sketch as **li-tests**-runnable example under experimental path (not std promotion).
- List 3 reference engines (Godot, Bevy, Unity DOTS) with **Learned from** one-liners in deliverable.
- Proof gate: every new `proc` has `requires`/`ensures`; no `sorry`, no new `trusted.lean`.

## Out of scope

- Full renderer, physics, networking, asset pipeline.
- Benchmark claims without dashboard row.

## Evidence required

- `li-tests` id or local test command in PR body.
- Link research session goal `game_engine_ux` in Agent deliverable.
