import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRemediationManifest } from "./remediation-manifest.js";

test("buildRemediationManifest filters docs ui failures", () => {
  const briefing = {
    ui_audit: {
      targets: [
        {
          target_id: "lic-docs",
          repo: "lic",
          surface_class: "docs",
          status: "fail",
          axe_violations: [],
        },
      ],
    },
  };
  const m = buildRemediationManifest("docs_ui_tester", briefing);
  assert.equal(m.issues.length, 1);
  assert.equal(m.implementation_queue[0]?.kind, "ui_remediation");
  assert.ok(m.implementation_queue[0]?.files_hint?.length);
});
