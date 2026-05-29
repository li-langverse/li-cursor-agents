# Release notes: 2026-05-29 — cursor-my-machines-worker-dir

**Status:** Ready for review  
**Repo:** li-langverse/li-cursor-agents  
**PR:** branch `cursor/majico-machine-worker-20c3`  
**PH / REQ:** N/A — local Cursor worker operations, no Li language phase gate  
**Author:** agent

---

## Summary (one sentence)

Windows Cursor My Machines scripts can now register a named worker against another checkout such as `majico`, so that machine can be selected for matching Cursor Cloud Agent launches.

## Agent continuation (required)

1. Read: `docs/remote-access.md`, `scripts/windows/start-cursor-worker.ps1`, `scripts/windows/enable-boot-ssh-and-cursor.ps1`.
2. Run: `powershell -NoProfile -Command "$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile('scripts/windows/start-cursor-worker.ps1', [ref]$null, [ref]$errors) > $null; if ($errors.Count) { $errors | Format-List; exit 1 }"` and repeat for `scripts/windows/enable-boot-ssh-and-cursor.ps1`.
3. Then: on the Windows host, run `.\scripts\windows\enable-boot-ssh-and-cursor.ps1 -SkipSsh -WorkerName majico -WorkerDir "<majico checkout>" -TaskName LiCursorMyMachinesWorkerMajico`, then confirm `majico` appears in Cursor's machine picker for the matching repo remote.
4. Blocked on: human action to run `agent login` and choose the exact local `majico` checkout path; secrets stay in Cursor UI.

## Changed (specific)

| Area | What | Evidence |
|------|------|----------|
| Windows worker launcher | `scripts/windows/start-cursor-worker.ps1` accepts `-WorkerDir` / `CURSOR_WORKER_DIR`, resolves it, uses it as the process working directory, and passes `--worker-dir` when explicitly set. | PowerShell parser check |
| Windows boot task | `scripts/windows/enable-boot-ssh-and-cursor.ps1` passes `-WorkerDir` through elevation and Task Scheduler registration; docs show a separate `LiCursorMyMachinesWorkerMajico` task. | PowerShell parser check |
| Operator docs | `docs/remote-access.md` explains why hosted cloud machines do not show this PC and gives manual + logon commands for `majico`. | Doc review |
| Env example | `.env.example` documents `CURSOR_WORKER_NAME`, `CURSOR_WORKER_DIR`, and worker pool opt-in. | Doc review |

## Not changed (scope fence)

- Cursor-hosted cloud environment registration and secrets in Cursor UI are not changed.
- No `majico` repository files are modified; the worker directory must point to its real local checkout.
- No Li compiler, `lic`, `lip`, `lit`, Supabase, or agent scheduling behavior is changed.

## Breaking changes

N/A — existing scripts keep the repo root default when `-WorkerDir` / `CURSOR_WORKER_DIR` is not provided.

## Security

N/A — this only documents/forwards local paths and worker names; no secrets are committed and `agent login` remains a local human action.

## Performance

N/A — startup script argument handling only; no hot path or benchmarked runtime behavior.

## Downstream

| Repo | Action |
|------|--------|
| majico | Optional: add its own `.cursor/environment.json` if it needs a hosted cloud image; no automatic change from this PR. |
| li-cursor-agents hosts | Re-run the Windows boot script with `-WorkerDir` for each extra named worker. |

## CHANGELOG entry (paste into Unreleased)

```markdown
### Added
- **Cursor My Machines worker directories** — Windows worker scripts accept `-WorkerDir` / `CURSOR_WORKER_DIR`; docs show registering this PC as a selectable `majico` machine.
```
