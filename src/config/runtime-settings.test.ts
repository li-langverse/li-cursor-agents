import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { patchSettings, listSettingsViews } from "./runtime-settings.js";

describe("runtime-settings", () => {
  let cpDir: string;
  const prevCp = process.env.LI_CONTROL_PLANE_DIR;

  before(() => {
    cpDir = mkdtempSync(join(tmpdir(), "li-settings-"));
    process.env.LI_CONTROL_PLANE_DIR = cpDir;
  });

  after(() => {
    if (prevCp === undefined) delete process.env.LI_CONTROL_PLANE_DIR;
    else process.env.LI_CONTROL_PLANE_DIR = prevCp;
    if (cpDir && existsSync(cpDir)) rmSync(cpDir, { recursive: true, force: true });
  });

  test("patch persists and applies to process.env", () => {
    const out = patchSettings({ LI_SUPERVISOR_MAX_TASKS: "5" });
    assert.equal(process.env.LI_SUPERVISOR_MAX_TASKS, "5");
    const row = out.settings.find((s) => s.key === "LI_SUPERVISOR_MAX_TASKS");
    assert.equal(row?.source, "ui");
    assert.equal(row?.value, "5");
  });

  test("cooldown alias syncs", () => {
    patchSettings({ LI_AGENTS_COOLDOWN_MS: "99999" });
    assert.equal(process.env.LI_SUPERVISOR_COOLDOWN_MS, "99999");
  });

  test("reset removes ui override", () => {
    patchSettings({}, { resetKeys: ["LI_SUPERVISOR_MAX_TASKS"] });
    const row = listSettingsViews().settings.find((s) => s.key === "LI_SUPERVISOR_MAX_TASKS");
    assert.notEqual(row?.source, "ui");
  });
});
