# Capturing agent / supervisor errors

Run from `li-cursor-agents` root:

```bash
bash scripts/capture-agent-errors.sh
# writes: data/capture/<UTC-timestamp>/snapshot.md, *.errors.txt, *.tail.txt
```

Repeat on an interval while the swarm runs, then search:

```bash
grep -Rhi error data/capture/session-*/
```

Session folders are gitignored (`data/capture/`).
