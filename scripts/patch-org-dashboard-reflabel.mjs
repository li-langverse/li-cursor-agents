#!/usr/bin/env node
/** Hotfix org-supervisor-dashboard refLabel (?? vs ?: precedence bug). */
import fs from "node:fs";
import path from "node:path";

const distDir = process.argv[2] ?? "apps/org-supervisor-dashboard/dist/assets";
const files = fs.readdirSync(distDir).filter((f) => f.endsWith(".js"));
const oldFn =
  'function _v(T){if(T.researchRef){const Q=T.dimension?` (${T.dimension})`:"";return`${String(T.researchRef)}${Q}`}return String(T.issueRef??T.prRef??T.repo?`${T.repo}#${T.number}`:T.workerId??"—")}';
const newFn =
  'function _v(T){if(T.researchRef){const Q=T.dimension?` (${T.dimension})`:"";return`${String(T.researchRef)}${Q}`}if(T.issueRef)return String(T.issueRef);if(T.prRef)return String(T.prRef);if(T.repo!=null&&T.number!=null)return`${String(T.repo)}#${String(T.number)}`;return String(T.workerId??"—")}';

let patched = 0;
for (const file of files) {
  const p = path.join(distDir, file);
  const text = fs.readFileSync(p, "utf8");
  if (!text.includes(oldFn)) continue;
  fs.writeFileSync(p, text.replace(oldFn, newFn));
  console.log("patched", p);
  patched++;
}
if (!patched) {
  console.error("refLabel pattern not found in", distDir);
  process.exit(1);
}
