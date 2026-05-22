#!/usr/bin/env bash
# Copy canonical agent skills into li-cursor-agents/.cursor/skills/ (SDK runner source of truth).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BENCH="${BENCHMARKS_ROOT:-$ROOT/../benchmarks}"
LIC="${LIC_ROOT:-$ROOT/../lic}"
DST="$ROOT/.cursor/skills"
mkdir -p "$DST"

from_benchmarks=(
  explore-li-ecosystem
  review-pr-alignment
  merge-approved-pr
  plan-merge-queue
  resolve-merge-conflicts
  research-li-numerics
  numerics-autoresearch
  ecosystem-first
)

from_lic=(
  hpc-competitive-review
)

from_agent_kit=(
  li-ecosystem-discipline
  plan-feature-from-issue
  audit-plan-completion
  write-li-release-notes
)

copy_skill() {
  local src="$1" name="$2"
  if [[ ! -f "$src" ]]; then
    echo "skip missing $name ($src)" >&2
    return 1
  fi
  rm -rf "$DST/$name"
  mkdir -p "$DST/$name"
  cp "$src" "$DST/$name/SKILL.md"
  echo "synced $name"
}

for name in "${from_benchmarks[@]}"; do
  copy_skill "$BENCH/.cursor/skills/$name/SKILL.md" "$name" || true
done

for name in "${from_lic[@]}"; do
  copy_skill "$LIC/.cursor/skills/$name/SKILL.md" "$name" || true
done

KIT="$ROOT/../roadmap/agent-kit/.cursor/skills"
for name in "${from_agent_kit[@]}"; do
  if [[ -f "$ROOT/.cursor/skills/$name/SKILL.md" ]]; then
    echo "keep local $name"
  elif [[ -f "$KIT/$name/SKILL.md" ]]; then
    copy_skill "$KIT/$name/SKILL.md" "$name"
  fi
done

# Fix doc links that assume benchmarks/.cursor/skills/ layout
if [[ -f "$DST/research-li-numerics/SKILL.md" ]]; then
  sed -i 's|\[research-methodology\.md\](../../../docs/numerics/research-methodology.md)|[research-methodology.md](https://github.com/li-langverse/benchmarks/blob/main/docs/numerics/research-methodology.md)|g' \
    "$DST/research-li-numerics/SKILL.md"
  sed -i 's|\.\./\.\./automations/|https://github.com/li-langverse/benchmarks/tree/main/.cursor/automations/|g' \
    "$DST/research-li-numerics/SKILL.md" || true
fi

# li-cursor-agents-only skills (never overwrite)
for name in explore-control-plane-db push-li-github agent-diagnose-fix-li; do
  if [[ -f "$DST/$name/SKILL.md" ]]; then
    echo "keep $name (package-local)"
  fi
done

echo "skills at $DST: $(find "$DST" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
