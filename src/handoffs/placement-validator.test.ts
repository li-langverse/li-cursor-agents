import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handoffReadyForImplement,
  validateNorthStarFit,
  validatePackagePlacement,
} from "./placement-validator.js";
import type { AgentHandoff } from "./types.js";

test("validateNorthStarFit rejects empty", () => {
  assert.ok(validateNorthStarFit(undefined));
  assert.equal(validateNorthStarFit("domains: hpc; PH-5b"), null);
});

test("handoffReadyForImplement requires placement and north_star_fit", () => {
  const base: AgentHandoff = {
    handoff_id: "h1",
    from_agent: "stdlib_researcher",
    to_agents: ["code_implementer"],
    status: "pending",
    work: {},
    north_star_fit: "stdlib ecosystem; domains: ecosystem",
    package_placement: {
      action: "extend_std",
      target: "lic/std/math",
      rationale: "missing matrix ops for HPC",
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  assert.equal(handoffReadyForImplement(base), true);
  assert.equal(validatePackagePlacement(base.package_placement!), null);
  assert.equal(handoffReadyForImplement({ ...base, package_placement: null }), false);
});

test("handoffReadyForImplement allows ui_remediation without package_placement", () => {
  const h: AgentHandoff = {
    handoff_id: "h-ui",
    from_agent: "gui_ux_tester",
    to_agents: ["code_implementer"],
    status: "pending",
    work: { kind: "ui_remediation", target_repo: "studio" },
    north_star_fit: "Remediate studio empty state per ux audit",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  assert.equal(handoffReadyForImplement(h), true);
});
