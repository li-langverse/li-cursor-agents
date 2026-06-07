# Plan loop: benchmark-nightly-green

Todos for `goal-directed-loop` stuck detection (`LI_GOAL_SELF_UNBLOCK=1`).

- id: bn1-lic-linker
  content: Fix lic linker failures for tier3 async_await_chain and tier7 registry Li builds
  status: pending

- id: bn2-sample-run-parity
  content: Ensure harness CSV has equal sample_runs for li and competitors (equalize + merge)
  status: pending

- id: bn3-tier1-csv-safety
  content: Harden tier1 parallel CSV writes and export BENCH_EQUALIZE_RUNS in nightly workflow
  status: pending

- id: bn4-local-gates
  content: benchmark-nightly-green-progress-gate.sh and completion gate pass on worker
  status: pending

- id: bn5-nightly-ci
  content: GitHub benchmark-nightly fast run green through publish-dashboard
  status: pending
