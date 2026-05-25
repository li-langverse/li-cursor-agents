# Studio X demo relocated to studio repo

## Summary

Removes Studio X demo tree from li-cursor-agents; canonical assets are in **li-langverse/studio** on branch `feat/studio-x-demo`.

## Agent continuation

1. **Read** — `docs/demo/README.md` (pointer); studio `docs/demo/RECORDING.md`.
2. **Run** — In studio checkout: `./scripts/record-studio-x-demo.sh`.
3. **Then** — Review/merge studio PR; do not merge li-cursor-agents PR #14 demo content.
4. **Blocked on** — None for relocation; native wgpu capture still needs display + PH-GD shell.

## Changed

| Path | Change |
|------|--------|
| `docs/demo/*` (script, RECORDING, mp4) | Removed |
| `scripts/record-studio-x-demo.sh` | Removed |
| `docs/demo/README.md` | Pointer to studio repo |
| `CHANGELOG.md` | Demo entry notes relocation |
| `.gitignore` | Removed demo-cache entries (no longer used here) |

## Not changed

- **studio repo implementation** — added in separate studio PR, not this cleanup commit alone.
- **Dashboard / supervisor / agents** — control-plane unchanged.
- **lic** `deploy/studio-demo` — still sourced from `cursor/studio-ui-ux-plan-loop`.

## Breaking

N/A — overlay repo only; consumers must use studio paths.

## Security

N/A — file moves only.

## Performance

N/A.

## Downstream

| Consumer | Action |
|----------|--------|
| Agents posting X demo | Clone studio; use paths in `docs/demo/README.md` |
| PR #14 reviewers | Close or supersede with this relocation |
