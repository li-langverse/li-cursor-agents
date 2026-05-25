import { test } from "node:test";
import assert from "node:assert/strict";
import { getAgent } from "./registry.js";
import { resolveCursorSdkMode, sdkModeSystemPrefix } from "./sdk-mode.js";

test("resolveCursorSdkMode uses registry and defaults", () => {
  const architect = getAgent("package_architect");
  assert.ok(architect);
  assert.equal(resolveCursorSdkMode(architect), "plan");

  const impl = getAgent("code_implementer");
  assert.ok(impl);
  assert.equal(resolveCursorSdkMode(impl), "agent");
});

test("sdkModeSystemPrefix is non-empty for plan and debug", () => {
  assert.ok(sdkModeSystemPrefix("plan").includes("Plan"));
  assert.ok(sdkModeSystemPrefix("debug").includes("Debug"));
  assert.equal(sdkModeSystemPrefix("agent"), "");
});

test("LI_SDK_MODE_OVERRIDE wins", () => {
  const prev = process.env.LI_SDK_MODE_OVERRIDE;
  process.env.LI_SDK_MODE_OVERRIDE = "debug";
  const impl = getAgent("package_architect");
  assert.ok(impl);
  assert.equal(resolveCursorSdkMode(impl), "debug");
  if (prev === undefined) delete process.env.LI_SDK_MODE_OVERRIDE;
  else process.env.LI_SDK_MODE_OVERRIDE = prev;
});
