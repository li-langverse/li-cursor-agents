# ADR-li-mq-swarm-transport

**Status:** Accepted (pilot)  
**Date:** 2026-05-30  
**Package:** [limq](https://github.com/li-langverse/limq)

## Context

The async swarm uses in-process and file-based handoff queues. As agent count grows, we need a capability-governed, auditable message bus aligned with lis and lidb.

## Decision

1. Adopt **limq** as the swarm transport with topics `swarm.commands`, `swarm.events`, `swarm.handoffs`, `swarm.ci.merge`.
2. Implement dual-read in `src/mq/swarm-transport.ts`: when `LI_MQ_URL` is set, use limq HTTP API; otherwise legacy queues unchanged.
3. TLS terminates at lis; broker binds loopback only.

## Consequences

- Pilot with `LI_MQ_STORAGE=memory` before disk mode.
- lis must proxy `/v1/mq/*` (see limq/lis/routes.md).
- Throughput lower than Redis until C++ engine (phase 5).

## Links

- [limq swarm integration](../../limq/docs/swarm-integration.md)
- [swarm-architecture.md](../ecosystem/swarm-architecture.md)
