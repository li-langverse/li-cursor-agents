import assert from "node:assert/strict";
import test from "node:test";
import { restartControlPlaneStack } from "./restart-stack.js";

test("restartControlPlaneStack uses systemd path when dashboard unit active", async () => {
  let systemdRestarted = false;
  const r = await restartControlPlaneStack({
    dryRun: false,
    probeSystemd: async () => true,
    restartSystemd: async () => {
      systemdRestarted = true;
      return { ok: true, message: "mock systemd restart" };
    },
  });
  assert.equal(systemdRestarted, true);
  assert.match(r.message, /systemd/i);
});

test("restartControlPlaneStack dry-run systemd does not spawn keep-agents", async () => {
  const r = await restartControlPlaneStack({
    dryRun: true,
    probeSystemd: async () => true,
  });
  assert.match(r.message, /systemctl/i);
  assert.ok(!r.message.includes("keep-agents-running.sh"));
});

test("restartControlPlaneStack script path when not systemd", async () => {
  const r = await restartControlPlaneStack({
    dryRun: true,
    probeSystemd: async () => false,
  });
  assert.match(r.message, /keep-agents-running\.sh/);
});

test("restartControlPlaneStack skipped when LI_WORKSPACE_SWEEP_RESTART=0", async () => {
  const prev = process.env.LI_WORKSPACE_SWEEP_RESTART;
  process.env.LI_WORKSPACE_SWEEP_RESTART = "0";
  const r = await restartControlPlaneStack({ probeSystemd: async () => true });
  assert.equal(r.skipped, true);
  if (prev === undefined) delete process.env.LI_WORKSPACE_SWEEP_RESTART;
  else process.env.LI_WORKSPACE_SWEEP_RESTART = prev;
});
