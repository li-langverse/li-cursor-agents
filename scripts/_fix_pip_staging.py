#!/usr/bin/env python3
from pathlib import Path

patch = Path(__file__).resolve().parent / "_patch_ph_ml_self_unblock.py"
text = patch.read_text(encoding="utf-8")
marker = "    ensure_ph_ml_python_deps() {"
start = text.find(marker)
if start < 0:
    raise SystemExit("marker not found")
end = text.find("\n\n    sync_lic_repo", start)
new_fn = '''    ensure_ph_ml_python_deps() {
      if python3 -c "import numpy, torch, jax" 2>/dev/null; then
        echo "ph-ml-wave13-entrypoint: ph-ml python deps present"
        return 0
      fi
      echo "ph-ml-wave13-entrypoint: installing ph-ml python deps (numpy/torch/jax; tensorflow optional)"
      python3 -m pip install --user --break-system-packages \\
        "numpy==2.2.6" "torch==2.6.0" "jax==0.5.3" "jaxlib==0.5.3" \\
        >/tmp/ph-ml-pip-core.log 2>&1 || {
        echo "ph-ml-wave13-entrypoint: WARN core pip install failed; see /tmp/ph-ml-pip-core.log" >&2
        tail -15 /tmp/ph-ml-pip-core.log >&2 || true
      }
      python3 -m pip install --user --break-system-packages \\
        -r "${LIC_ROOT}/scripts/requirements-ph-ml-wave12-rl.txt" \\
        >/tmp/ph-ml-pip-rl.log 2>&1 || {
        echo "ph-ml-wave13-entrypoint: WARN rl pip install failed; see /tmp/ph-ml-pip-rl.log" >&2
      }
      python3 -m pip install --user --break-system-packages "tensorflow==2.18.1" \\
        >/tmp/ph-ml-pip-tf.log 2>&1 || echo "ph-ml-wave13-entrypoint: tensorflow optional (skipped or failed)"
      if python3 -c "import numpy" 2>/dev/null; then
        echo "ph-ml-wave13-entrypoint: ph-ml python deps ready (numpy+)"
      else
        echo "ph-ml-wave13-entrypoint: WARN numpy still missing after pip" >&2
      fi
    }'''
patch.write_text(text[:start] + new_fn + text[end:], encoding="utf-8")
print("updated patch script")
