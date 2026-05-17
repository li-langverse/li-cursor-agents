#!/usr/bin/env python3
"""Agentron-style heap planner — max 10 agents per coordinator, max 10 coordinators at root.

Reference: https://docs.agentron.rocks/concepts/heap/
"""
from __future__ import annotations

from typing import Any

MAX_AGENTS_PER_COORDINATOR = 10
MAX_COORDINATORS_PER_ROOT = 10
HEAP_REFERENCE = "https://docs.agentron.rocks/concepts/heap/"

COORDINATOR_LEAVES: dict[str, list[str]] = {
    "coord_pull_requests": ["pr_alignment", "pr_reviewer", "pr_merger"],
    "coord_numerics": ["numerics_researcher", "autoresearch", "bench_improver"],
    "coord_governance": ["plan_verifier", "implementation_gaps", "issue_planner"],
    "coord_ecosystem": ["gap_explorer", "docs_maintainer"],
    "coord_platform": ["ci_maintainer"],
}

COORDINATOR_PRIORITY = [
    "coord_pull_requests",
    "coord_numerics",
    "coord_governance",
    "coord_ecosystem",
    "coord_platform",
]

COORDINATOR_NAMES = {
    "coord_pull_requests": "PR coordinator",
    "coord_numerics": "Numerics coordinator",
    "coord_governance": "Governance coordinator",
    "coord_ecosystem": "Ecosystem coordinator",
    "coord_platform": "Platform coordinator",
}

LEGACY_AGENT_ALIASES = {
    "plan_completion": "plan_verifier",
    "ecosystem_explorer": "gap_explorer",
    "pr_review": "pr_reviewer",
    "numerics_research": "numerics_researcher",
}


def canonical_agent(agent: str) -> str:
    return LEGACY_AGENT_ALIASES.get(agent, agent)


def coordinator_for_agent(agent: str) -> str | None:
    agent = canonical_agent(agent)
    for coord, leaves in COORDINATOR_LEAVES.items():
        if agent in leaves:
            return coord
    return None


def build_heap_plan(recommended: list[dict[str, str]]) -> dict[str, Any]:
    by_coord: dict[str, list[dict[str, str]]] = {}
    for rec in recommended:
        agent = canonical_agent(rec.get("agent", ""))
        if agent == "orchestrator":
            continue
        coord = coordinator_for_agent(agent)
        if not coord:
            continue
        by_coord.setdefault(coord, []).append({"agent": agent, "reason": rec.get("reason", "")})

    validation_errors: list[str] = []
    if len(by_coord) > MAX_COORDINATORS_PER_ROOT:
        validation_errors.append(
            f"heap: {len(by_coord)} coordinators exceeds root max {MAX_COORDINATORS_PER_ROOT}"
        )
    for coord, agents in by_coord.items():
        if len(agents) > MAX_AGENTS_PER_COORDINATOR:
            validation_errors.append(
                f"heap: {coord} has {len(agents)} agents (max {MAX_AGENTS_PER_COORDINATOR})"
            )

    priority_order = [c for c in COORDINATOR_PRIORITY if c in by_coord][:MAX_COORDINATORS_PER_ROOT]
    layers = [
        {
            "coordinator": coord,
            "name": COORDINATOR_NAMES.get(coord, coord),
            "agents": by_coord[coord],
        }
        for coord in priority_order
    ]

    flat_tasks: list[dict[str, Any]] = []
    for coord in priority_order:
        prio = COORDINATOR_PRIORITY.index(coord) * 10 + 10
        for a in by_coord[coord]:
            flat_tasks.append(
                {
                    "coordinator": coord,
                    "agent": a["agent"],
                    "reason": a["reason"],
                    "priority": prio,
                }
            )

    return {
        "version": 1,
        "model": "agentron-heap-v1",
        "reference": HEAP_REFERENCE,
        "priority_order": priority_order,
        "layers": layers,
        "flat_tasks": flat_tasks,
        "validation_errors": validation_errors,
    }
