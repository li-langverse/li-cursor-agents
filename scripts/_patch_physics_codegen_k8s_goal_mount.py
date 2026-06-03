#!/usr/bin/env python3
"""Mount goal ConfigMap at lic-relative path for proof-explorer-entrypoint."""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "deploy" / "k8s" / "engine"

cm_path = root / "configmap-physics-codegen-matrix.yaml"
cm = cm_path.read_text(encoding="utf-8")
cm = cm.replace(
    'LI_PROOF_EXPLORER_GOAL_FILE: "/config/goal/physics-codegen-matrix.md"',
    'LI_PROOF_EXPLORER_GOAL_FILE: "data/goal-directed-sprints/physics-codegen-matrix.md"',
)
cm_path.write_text(cm, encoding="utf-8")

dep_path = root / "deployment-physics-codegen-matrix.yaml"
dep = dep_path.read_text(encoding="utf-8")
dep = dep.replace(
    "              mountPath: /config/goal\n              readOnly: true",
    "              mountPath: /workspace/lic/data/goal-directed-sprints/physics-codegen-matrix.md\n"
    "              subPath: physics-codegen-matrix.md\n              readOnly: true",
)
dep_path.write_text(dep, encoding="utf-8")
print("patched goal mount to lic path")
