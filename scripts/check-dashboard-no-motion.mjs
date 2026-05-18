#!/usr/bin/env node
/** Fail if stray <motion> tags corrupt Next.js dashboard TSX. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "dashboard-ui");
let failed = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".tsx") || name.endsWith(".jsx")) {
      const text = readFileSync(p, "utf8");
      if (/<\/?motion\b/.test(text)) {
        console.error(`FAIL ${p}: contains invalid <motion> tag`);
        failed++;
      }
    }
  }
}

walk(root);
process.exit(failed ? 1 : 0);
