---
name: agent-diagnose-fix-li
description: >-
  Fix Li source using lic diagnose/check JSON and li-tests. Use for CI-red .li
  files and automated repair loops in repo-workflow clones (usually lic).
---

# Agent diagnose & fix (Li)

Use when an agent must fix Li source using machine-readable diagnostics and `li-tests`.

## When to use

- Compile/type errors on `.li` files
- CI red on `lic check` / `lic build`
- User asks for automated fix loop with evidence

## Workflow

1. **Read gates** — `AGENTS.md`, `.cursor/rules/li-ecosystem-gates.mdc` (provability wins).
2. **Diagnose (JSON)** (in **lic** checkout):
   ```bash
   lic diagnose path/to/file.li
   lic check path/to/file.li --format=json
   ```
3. **Optional hints:**
   ```bash
   lic diagnose path/to/file.li | ./scripts/lic-fix-suggest.sh
   ```
4. **Edit** using `file`, `line`, `column`, `code`, `message` from JSON.
5. **Verify fast:** `lic check path/to/file.li`
6. **Verify proof path:** `lic build path/to/file.li -o /dev/null`
7. **Tests:** `./li-tests/run_all.sh` (or suite from manifest)

## Do not

- Treat `lic check` JSON as a proof certificate — use `lic build` for ship gates.
- Weaken contracts because an agent inferred intent.

## Canonical entry

https://github.com/li-langverse/lic/blob/main/docs/ecosystem/li-agent-manifest.toml
