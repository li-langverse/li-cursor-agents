---
workflow_repo: studio
---

# Sprint: World Studio AIMD GPU pilot — real chem_dft path on main

K8s worker `li-world-studio-aimd-demo` tracks **studio** `main` + **lic** `main`.

Canonical goal file (synced from studio): `studio/data/goal-directed-sprints/world-studio-aimd-gpu-pilot.md`

Post-W6 stub sprint merged (studio#79, lic#874). Next: W7 GPU pilot — `chem_dft_energy_kernel_hartree` every N steps when `science_gpu` gates green.

Deploy:

```powershell
.\scripts\deploy-world-studio-aimd-demo-k8s.ps1
```
