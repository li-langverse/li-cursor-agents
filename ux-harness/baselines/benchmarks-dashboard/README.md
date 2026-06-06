# benchmarks-dashboard Playwright baselines

Snapshot baselines for the benchmarks Next.js dashboard (`/` and `/gpu-matrix/`).

| Viewport | Directory | Routes |
|----------|-----------|--------|
| 1280×720 desktop | `desktop-1280x720/` | `home.png`, `gpu-matrix.png` |
| 1920×1080 desktop | `desktop-1920x1080/` | `home.png`, `gpu-matrix.png` |
| 390×844 mobile | `mobile-390x844/` | `home.png`, `gpu-matrix.png` |

Regenerate (requires Playwright + live or exported dashboard):

```bash
cd ../benchmarks/dashboard-next
npm install && npm run build
LI_BENCHMARKS_DASHBOARD_PORT=3100 npm run start &
python3 ../../li-cursor-agents/ux-harness/scripts/capture-benchmarks-dashboard-baselines.py
```

Offline smoke uses `ux-harness/fixtures/benchmarks-dashboard-fixture.html` when the dev server is down.
