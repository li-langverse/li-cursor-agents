import assert from "node:assert/strict";
import test from "node:test";
import { saveOrgSupervisorCycle } from "./org-supervisor-cycle.js";

test("saveOrgSupervisorCycle no-ops when db disabled", async () => {
  const prev = process.env.LI_CONTROL_PLANE_STORE;
  process.env.LI_CONTROL_PLANE_STORE = "disk";
  try {
    await assert.doesNotReject(() =>
      saveOrgSupervisorCycle("pr", {
        open_count: 3,
        desired_workers: 1,
        active_claims: [],
      }),
    );
  } finally {
    if (prev === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
    else process.env.LI_CONTROL_PLANE_STORE = prev;
  }
});
