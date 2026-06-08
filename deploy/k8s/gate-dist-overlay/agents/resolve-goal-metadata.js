import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
/** `**Branch:** \`cursor/foo\`` or `branch: cursor/foo` in YAML frontmatter. */
const BRANCH_BACKTICK = /\*\*Branch:\*\*\s*`([^`]+)`/i;
const BRANCH_PLAIN = /\*\*Branch:\*\*\s*([^\s\n`]+)/i;
const FRONTMATTER_BRANCH = /^branch:\s*(\S+)\s*$/im;
/** Relative plan path from `Plan loop:` markdown link target. */
const PLAN_LOOP_LINK = /Plan loop:\*\*\s*\[[^\]]*\]\(([^)]+)\)/i;
export function resolveBranchFromGoalText(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return undefined;
    const fm = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fm) {
        const fromFm = fm[1].match(FRONTMATTER_BRANCH)?.[1]?.trim();
        if (fromFm)
            return fromFm;
    }
    const tick = trimmed.match(BRANCH_BACKTICK)?.[1]?.trim();
    if (tick)
        return tick;
    const plain = trimmed.match(BRANCH_PLAIN)?.[1]?.trim();
    if (plain)
        return plain;
    return undefined;
}
export function resolvePlanRelFromGoalText(text) {
    const link = text.match(PLAN_LOOP_LINK)?.[1]?.trim();
    if (!link)
        return undefined;
    return link.replace(/^\.\.\//, "");
}
export function resolveBranchFromGoalFile(goalFile) {
    const path = resolve(goalFile);
    const text = readFileSync(path, "utf8");
    return resolveBranchFromGoalText(text);
}
export function resolvePlanPathFromGoalFile(goalFile, cwd) {
    const path = resolve(goalFile);
    const text = readFileSync(path, "utf8");
    const rel = resolvePlanRelFromGoalText(text);
    if (!rel)
        return undefined;
    const base = cwd ? resolve(cwd) : resolve(path, "..");
    return resolve(base, rel);
}
/** Infer `wsv-w*` / `wsp-w*` / `wsg-w*` plan id prefix from goal filename when plan link missing. */
export function inferPlanPrefixFromGoalFile(goalFile) {
    const name = basename(goalFile, ".md");
    if (name.includes("product-visual"))
        return "wsv-w";
    if (name.includes("gui-polish"))
        return "wsp-w";
    if (name.includes("gui-library") || name === "world-studio-gui-library")
        return "wsg-w";
    if (name.includes("master-plan"))
        return "wsm-w";
    return undefined;
}
//# sourceMappingURL=resolve-goal-metadata.js.map