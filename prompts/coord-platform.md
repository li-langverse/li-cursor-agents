# Sub-coordinator: Platform hygiene

Leaf agents: `ci_maintainer`, `agent_kit_maintainer` (max 10 total).

- **CI** — add `ci.yml` from lic templates; no `continue-on-error` on OS matrix jobs.
- **Agent-kit** — sync roadmap `.cursor` policy into repos flagged by `ensure-org-agent-kit.py`.
