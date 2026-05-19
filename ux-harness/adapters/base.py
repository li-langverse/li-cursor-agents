"""Shared types for UX harness adapters."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class TargetConfig:
    id: str
    repo: str
    surface: str
    surface_class: str
    adapter: str
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TargetConfig:
        return cls(
            id=str(data["id"]),
            repo=str(data.get("repo", "")),
            surface=str(data.get("surface", "")),
            surface_class=str(data.get("surface_class", data.get("surface", ""))),
            adapter=str(data.get("adapter", "")),
            raw=data,
        )


def should_skip_platform(target: TargetConfig) -> str | None:
    import platform

    skip = target.raw.get("skip_on_platform") or []
    if platform.system().lower() in {s.lower() for s in skip}:
        return f"skipped on {platform.system()}"
    return None
