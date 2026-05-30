#!/usr/bin/env python3
"""Append lidb-engine-e2e job to ci.yml (WP-G)."""
from pathlib import Path

p = Path(__file__).resolve().parents[1] / ".github/workflows/ci.yml"
t = p.read_text(encoding="utf-8")

if "lidb-engine-e2e" in t:
    print("ci already has lidb-engine-e2e")
    raise SystemExit(0)

if "pull_request:" not in t:
    t = t.replace(
        "on:\n  workflow_dispatch:\n  push:",
        "on:\n  workflow_dispatch:\n  pull_request:\n  push:",
    )

job = """
  lidb-engine-e2e:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: li-langverse/lidb
          path: lidb
      - uses: actions/setup-node@v4
        with:
          node-version: \"22\"
          cache: npm
      - name: Build lidb_embed
        run: |
          sudo apt-get update
          sudo apt-get install -y cmake g++ python3
          cmake -S lidb -B lidb/build/smoke -DCMAKE_BUILD_TYPE=Release
          cmake --build lidb/build/smoke --target lidb_embed -j
      - name: Install and test
        env:
          LI_CONTROL_PLANE_STORE: lidb
          LI_E2E_LIDB: \"1\"
          LI_E2E_LIDB_ENGINE: \"1\"
          LI_LIDB_REPO: lidb
          LI_DATA_DIR: /tmp/li-cp-e2e
        run: |
          npm ci
          npm run build
          npm run test:e2e:lidb-engine
"""

t = t.rstrip() + job + "\n"
p.write_text(t, encoding="utf-8")
print("patched ci.yml")
