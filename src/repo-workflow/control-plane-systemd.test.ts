import assert from "node:assert/strict";
import test from "node:test";
import {
  controlPlaneManagedBySystemd,
  controlPlaneSystemdForced,
  restartControlPlaneSystemdUnits,
} from "./control-plane-systemd.js";

test("controlPlaneSystemdForced respects LI_CONTROL_PLANE_SYSTEMD", () => {
  const prev = process.env.LI_CONTROL_PLANE_SYSTEMD;
  process.env.LI_CONTROL_PLANE_SYSTEMD = "1";
  assert.equal(controlPlaneSystemdForced(), true);
  process.env.LI_CONTROL_PLANE_SYSTEMD = "0";
  assert.equal(controlPlaneSystemdForced(), false);
  if (prev === undefined) delete process.env.LI_CONTROL_PLANE_SYSTEMD;
  else process.env.LI_CONTROL_PLANE_SYSTEMD = prev;
});

test("controlPlaneManagedBySystemd uses injected isActive", async () => {
  const active = await controlPlaneManagedBySystemd(async (unit) =>
    unit === "li-agents-dashboard.service" ? "active" : "inactive",
  );
  assert.equal(active, true);

  const inactive = await controlPlaneManagedBySystemd(async () => "inactive");
  assert.equal(inactive, false);
});

test("restartControlPlaneSystemdUnits calls systemctl try-restart", async () => {
  const calls: string[][] = [];
  const r = await restartControlPlaneSystemdUnits({
    execFile: async (_cmd, args: string[]) => {
      calls.push([...args]);
    },
  });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ["--user", "try-restart", "li-agents-dashboard.service"]);
  assert.deepEqual(calls[1], ["--user", "try-restart", "li-agents-async-swarm.service"]);
});
