import test from "node:test";
import assert from "node:assert/strict";
import {
  extractCompletionGateScript,
  extractProgressGateScript,
  evaluateGoalCompletion,
  pendingPlanTodos,
  phasesMarkedDone,
  requiredPhases,
} from "./completion-gate.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("extractCompletionGateScript finds bash block", () => {
  const md = `## Completion gate

\`\`\`bash
python3 scripts/audit.py
\`\`\`
`;
  assert.equal(extractCompletionGateScript(md), "python3 scripts/audit.py");
});

test("extractProgressGateScript finds bash block under Progress gate", () => {
  const md = `## Progress gate

\`\`\`bash
python3 scripts/audit-dashboard-gaps.py
\`\`\`

## Completion gate

\`\`\`bash
./scripts/regression-check.sh
\`\`\`
`;
  assert.equal(
    extractProgressGateScript(md),
    "python3 scripts/audit-dashboard-gaps.py",
  );
  assert.match(extractCompletionGateScript(md) ?? "", /regression-check/);
});

test("requiredPhases and phasesMarkedDone (status column only)", () => {
  const md = `### Phase A  foo
### Phase B  bar
| **A** | **DONE** | notes |
| **B** | in progress | **DONE** in notes only |
`;
  assert.deepEqual(requiredPhases(md), ["A", "B"]);
  assert.deepEqual(phasesMarkedDone(md), ["A"]);
});

test("evaluateGoalCompletion runs progress gate when phases remain", () => {
  const dir = mkdtempSync(join(tmpdir(), "goal-gate-"));
  const goal = join(dir, "plan.md");
  writeFileSync(
    goal,
    `### Phase A  a
### Phase B  b
| **A** | **DONE** |
| **B** | NEXT |

## Progress gate

\`\`\`bash
true
\`\`\`

## Completion gate

\`\`\`bash
false
\`\`\`
`,
  );
  const result = evaluateGoalCompletion({ goalFile: goal, cwd: dir });
  assert.equal(result.complete, false);
  assert.equal(result.progressOnly, true);
  assert.match(result.reason, /progress gate passed; phases remaining: B/);
});

test("phasesMarkedDone reads **DONE** in last column (3-col table)", () => {
  const md = `### Phase W0 - foundation
### Phase W1 - core
| Phase | Scope | Status |
| **W0** | docs | **DONE** |
| **W1** | sim | pending |
`;
  assert.deepEqual(phasesMarkedDone(md), ["W0"]);
  assert.deepEqual(requiredPhases(md), ["W0", "W1"]);
});

test("evaluateGoalCompletion rejects when plan YAML todos remain (no Phase headings)", () => {
  const dir = mkdtempSync(join(tmpdir(), "goal-gate-plan-"));
  const plan = join(dir, "docs/plans/loop.md");
  const goal = join(dir, "data/goal.md");
  mkdirSync(join(dir, "docs/plans"), { recursive: true });
  mkdirSync(join(dir, "data"), { recursive: true });
  writeFileSync(
    plan,
    `---
todos:
  - id: aimd-w0-audit
    content: "W0"
    status: done
  - id: aimd-w3-gpu-path
    content: "W3"
    status: pending
---
`,
  );
  writeFileSync(
    goal,
    `**Plan loop:** [loop.md](../docs/plans/loop.md)

## Completion gate

\`\`\`bash
true
\`\`\`
`,
  );
  const result = evaluateGoalCompletion({ goalFile: goal, cwd: dir });
  assert.equal(result.complete, false);
  assert.match(result.reason, /plan todos pending: aimd-w3-gpu-path/);
  assert.deepEqual(pendingPlanTodos(goal, dir), ["aimd-w3-gpu-path"]);
});
