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
CURSOR_SDK=<your key from dashboard.integrations>
```

**You must restart the Cloud Agent VM** after adding or changing env vars. Existing VMs do not pick up new secrets (a background `wait-and-overnight` from the old session will never see the key).

After restart, from the agent chat ask to run:

```bash
cd li-cursor-agents && ./scripts/session-start-sdk.sh
```

Or manually:

```bash
./scripts/check-sdk-key.sh && ./scripts/sdk-smoke.sh && ./scripts/overnight-run.sh
```

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
