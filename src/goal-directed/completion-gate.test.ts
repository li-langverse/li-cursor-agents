import test from "node:test";
import assert from "node:assert/strict";
import {
  extractCompletionGateScript,
  phasesMarkedDone,
  requiredPhases,
} from "./completion-gate.js";

test("extractCompletionGateScript finds bash block", () => {
  const md = `## Completion gate

\`\`\`bash
python3 scripts/audit.py
\`\`\`
`;
  assert.equal(extractCompletionGateScript(md), "python3 scripts/audit.py");
});

test("requiredPhases and phasesMarkedDone", () => {
  const md = `### Phase A — foo
### Phase B — bar
| **A** | **DONE** |
| **B** | in progress |
`;
  assert.deepEqual(requiredPhases(md), ["A", "B"]);
  assert.deepEqual(phasesMarkedDone(md), ["A"]);
});
