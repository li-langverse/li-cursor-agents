#!/usr/bin/env node
import { evaluateGoalCompletion } from "../goal-directed/completion-gate.js";
function parseArgs(argv) {
    let goalFile = "";
    let cwd = process.cwd();
    let gateScript = "";
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--goal-file")
            goalFile = argv[++i];
        else if (a === "--cwd")
            cwd = argv[++i];
        else if (a === "--gate-script")
            gateScript = argv[++i];
        else if (a === "--help" || a === "-h") {
            console.log(`goal-completion-gate — exit 0 when the plan goal is fully achieved

Usage:
  node dist/cli/goal-completion-gate.js --goal-file ./plan.md [--cwd ../repo]

Reads ## Completion gate bash block from the goal file and checks phase status
table rows (| **A** ... | **DONE** |). Used by goal-directed-loop.sh.
`);
            process.exit(0);
        }
    }
    return { goalFile, cwd, gateScript };
}
const args = parseArgs(process.argv.slice(2));
if (!args.goalFile) {
    console.error("goal-completion-gate: pass --goal-file");
    process.exit(2);
}
const result = evaluateGoalCompletion({
    goalFile: args.goalFile,
    cwd: args.cwd,
    gateScriptPath: args.gateScript || undefined,
});
if (process.env.LI_GOAL_COMPLETION_JSON === "1") {
    console.log(JSON.stringify(result, null, 2));
}
else {
    console.log(result.complete ? "GOAL_COMPLETE" : "GOAL_INCOMPLETE");
    console.log(result.reason);
    if (result.phases_required.length) {
        console.log(`phases: ${result.phases_done.join(",") || "none"}/${result.phases_required.join(",")}`);
    }
}
process.exit(result.complete ? 0 : 1);
//# sourceMappingURL=goal-completion-gate.js.map