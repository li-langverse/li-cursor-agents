# Cursor terminal not opening (Windows)

## Symptom

- **Terminal** panel stays blank or spins
- Agent says it cannot run shell commands
- Log: `No ptyHost heartbeat after 6 seconds` (Cursor main log)

PowerShell/cmd work fine outside Cursor; the **pty host process** inside Cursor is stuck.

## Quick fix (try in order)

1. **Command Palette** (`Ctrl+Shift+P`):
   - `Terminal: Kill All Terminals`
   - `Developer: Reload Window`
2. **Cursor Settings** (`Ctrl+Shift+J`) → **Agents** → **Inline Editing & Terminal** → enable **Legacy Terminal Tool** → reload.
3. **Open a real folder**: `File → Open Folder` → `li-cursor-agents` or `li` (not an empty/no-folder window).
4. **Close extra Cursor windows** — many worktrees/agents can wedge the shared pty host.
5. Fully **quit Cursor** (all windows) and reopen.
6. Still broken: reboot Windows (clears stuck ConPTY/pty state).

## Settings (already in user `settings.json`)

- Explicit **PowerShell** default profile
- `terminal.integrated.cwd`: `${workspaceFolder}`
- GPU acceleration **off** for terminal (ConPTY stability)
- **WSL remote disabled** if you only use local Windows (avoids Remote-WSL extension noise)

## Workspace

Open `C:\Users\Julian\Documents\Programming\li` or `li-cursor-agents` as the folder root so terminals start in a valid cwd.

## Remote SSH

If the problem is only on **Remote SSH** to this PC or another host:

- `Remote-SSH: Kill VS Code Server on Host`
- On the remote: `rm -rf ~/.cursor-server` then reconnect
- Set `terminal.integrated.defaultProfile.linux` to `bash`

## Verify shell manually

```powershell
powershell -NoProfile -Command "Write-Output ok"
```

If that fails, fix PATH/shell install before debugging Cursor.
