# Cloud Agent / Background Agent secrets

For **overnight SDK runs** in a Cursor Cloud Agent VM, the API key must be in **this process environment**, not only in your local IDE.

## Supported variable names

| Variable | Notes |
|----------|--------|
| `CURSOR_API_KEY` | Official SDK name |
| `CURSOR_SDK_KEY` | Alias |
| `CURSOR_SDK` | Alias |

## Option A — Cursor Cloud Agent env (recommended)

In Cursor → your Cloud / Background Agent settings → **Environment variables**:

```
CURSOR_SDK_KEY=<your key from dashboard.integrations>
```

Restart or start a new agent session so the VM inherits it.

## Option B — `li-cursor-agents/.env` (gitignored)

```bash
cd li-cursor-agents
cp .env.example .env
# edit: CURSOR_SDK_KEY=...
```

## Run overnight

```bash
cd li-cursor-agents
./scripts/wait-and-overnight.sh >> data/runs/wait-overnight.log 2>&1 &
tail -f data/runs/overnight-*.log
```

Or if the key is already set:

```bash
./scripts/overnight-run.sh
```

## Smoke test

```bash
./scripts/sdk-smoke.sh
```
