# ADR: Swarm transport via limq

**Status:** Accepted (pilot)  
**Date:** 2026-05-30  
**Package:** [li-langverse/limq](https://github.com/li-langverse/limq)

## Context

The swarm control plane polls `GET /api/queue` backed by in-process `agent-work-queue.js`. That does not scale to multi-pod K8s or durable handoff replay.

## Decision

1. Introduce **limq** as the Li-native command/event bus.
2. Add `src/mq/swarm-transport.ts` with **dual-read**: no `LI_MQ_URL` → legacy queue unchanged.
3. Topic catalog: `swarm.commands`, `swarm.events`, `swarm.handoffs`, `swarm.ci.merge`, `swarm.dlq`.
4. Phase 4 pilot on registry host (disk mode) before K8s; single broker StatefulSet.

## Consequences

- Dashboard may keep `/api/queue` as a read-model projection during pilot.
- Performance: phase 1 memory p99 target &lt; 50 ms; not Redis-par until C++ engine.
- lis PR required for `/v1/mq/*` edge (see `limq/lis/routes.md`).

## References

- [limq/docs/swarm-integration.md](../../../limq/docs/swarm-integration.md)
- [swarm-architecture.md](../ecosystem/swarm-architecture.md)
