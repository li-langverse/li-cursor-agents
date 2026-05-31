# Goal-directed sprint: limq prod bench (Redis vs lis) — close all stubs

**North star:** Container C2 matrix measures **production-shaped** paths only: Redis (`redis-server`) vs **lis `/v1/mq/*` → limq broker**. No Python ring/sleep stubs in default runs. Numbers tuned after plumbing is green.

**Repos:** `li-langverse/limq` (primary), `li-langverse/lis` (native MQ proxy), `li-langverse/lic` (build `limq serve`)

**Workspace roots:** `C:\Users\Julian\Documents\Programming\li\limq`, `...\lis`, `...\lic`

---

## Phase A — Wire stack (in progress on main)

| ID | Deliverable | Done when |
|----|-------------|-----------|
| A1 | `benchmarks/containers/stack/` broker + lis bench proxy + `bench_lis_wire.py` | compose up, health 200 |
| A2 | `run.sh` starts `limq-stack` before runner | runner sees `LIS_URL`, `BROKER_URL` |
| A3 | `run_all.py` emits `measured_wire` rows + G1–G4/G10 from wire | `out/results.json` has lis + loopback |
| A4 | Remove default pending rows when wire env set | COMPETITORS auto-update script |

## Phase B — Replace bench reference with Li binary

| ID | Deliverable | Done when |
|----|-------------|-----------|
| B1 | `lic build` produces `limq serve` in stack image (multi-stage Dockerfile) | `start-broker.sh` execs limq, not reference_broker_http.py |
| B2 | Disk mode bench via `LI_MQ_STORAGE=disk` on Li broker | G3 gate computed |
| B3 | Delete or gate `BENCH_LIMQ_PYTHON_STUB` archaeology | CI fails if stub used in reporter |

## Phase C — lis native (separate PR to li-langverse/lis)

| ID | Deliverable | Done when |
|----|-------------|-----------|
| C1 | Implement `/v1/mq/*` in lis per `limq/lis/routes.md` | bench can drop `lis_mq_proxy.py` |
| C2 | JWT + capability mint in bench (test token) | auth on critical path optional row |

## Phase D — Competitors & homelab

| ID | Deliverable | Done when |
|----|-------------|-----------|
| D1 | Kafka/Redpanda row green (wait + topic create) | G5 pass |
| D2 | Homelab CronJob `RUN_CONTAINER_BENCH=1` uses new stack | 48h green pushes |
| D3 | `update-competitors-md.py` maps `single_lis`, `batch_lis` | COMPETITORS.md quantitative |

## Phase E — Features (stubs → parity or ADR)

| ID | Deliverable | Gate |
|----|-------------|------|
| E1 | Fan-out ADR + router stub documented | G6 |
| E2 | Retention env + seal policy | G7 |
| E3 | 24h soak `soak-swarm-pilot.sh` on li-swarm | G9 |

---

## Verification commands

```bash
cd limq/benchmarks/containers
bash run.sh
python3 -c "import json; d=json.load(open('out/results.json')); print([s for s in d['systems'] if s.get('status')=='measured_wire'])"
```

## Exit criteria

- [ ] No `pending_li_native` in default bench JSON
- [ ] `reference_broker_http.py` not used in prod image tag (only `bench` image until B1)
- [ ] G10 pass/fail based on **lis** `batch_lis` throughput vs Redis single
- [ ] User can read COMPETITORS.md without deprecated stub numbers

## Agent instructions

1. Work on branch `feat/limq-prod-bench-wire` (or main if user prefers).
2. Commit small PRs; push `limq` after each phase.
3. Do **not** tune `LI_MODELED_OVERHEAD_*`; tune Li/httpd only after A–D green.
4. Log progress in `data/goal-directed-sprints/limq-prod-bench-log.md`.
