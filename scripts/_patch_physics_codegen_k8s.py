#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "deploy" / "k8s" / "engine"
cm_path = root / "configmap-physics-codegen-matrix.yaml"
cm = cm_path.read_text(encoding="utf-8")
cm = cm.replace(
    'LI_PROOF_EXPLORER_GOAL_FILE: "data/goal-directed-sprints/physics-codegen-matrix.md"',
    'LI_PROOF_EXPLORER_GOAL_FILE: "/config/goal/physics-codegen-matrix.md"',
)
cm = cm.replace(
    'LI_PROOF_EXPLORER_BRANCH: "cursor/physics-codegen-matrix"',
    'LI_PROOF_EXPLORER_BRANCH: "cursor/ph-ml-wave13-self-unblock"',
)
cm = cm.replace(
    'LI_PROOF_EXPLORER_BRANCH_FALLBACKS: "main,cursor/physics-codegen-matrix"',
    'LI_PROOF_EXPLORER_BRANCH_FALLBACKS: "main,cursor/ph-ml-wave13-self-unblock,cursor/physics-codegen-matrix"',
)
cm_path.write_text(cm, encoding="utf-8")

dep_path = root / "deployment-physics-codegen-matrix.yaml"
dep = dep_path.read_text(encoding="utf-8")
if "sprint-goal" not in dep:
    dep = dep.replace(
        "            - name: workspace\n              mountPath: /workspace\n      volumes:",
        "            - name: workspace\n              mountPath: /workspace\n"
        "            - name: sprint-goal\n              mountPath: /config/goal\n"
        "              readOnly: true\n      volumes:",
    )
    dep = dep.replace(
        "            claimName: li-physics-codegen-matrix-workspace\n",
        "            claimName: li-physics-codegen-matrix-workspace\n"
        "        - name: sprint-goal\n          configMap:\n"
        "            name: li-physics-codegen-matrix-goal\n",
    )
dep_path.write_text(dep, encoding="utf-8")

setup_path = Path(__file__).resolve().parents[1] / "scripts" / "setup-engine-k8s-physics-codegen-matrix.sh"
setup = setup_path.read_text(encoding="utf-8")
if "configmap-physics-codegen-matrix-goal" not in setup:
    setup = setup.replace(
        'kubectl apply -f "$K8S/configmap-physics-codegen-matrix.yaml"',
        'kubectl apply -f "$K8S/configmap-physics-codegen-matrix.yaml"\n'
        'kubectl apply -f "$K8S/configmap-physics-codegen-matrix-goal.yaml"',
    )
setup_path.write_text(setup, encoding="utf-8")
print("ok")
