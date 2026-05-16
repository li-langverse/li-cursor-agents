import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Load optional .env from package root or BENCHMARKS_ROOT (KEY=value, no export required). */
export function loadDotEnv(): void {
  const roots = [
    process.env.LI_CURSOR_AGENTS_ROOT,
    process.cwd(),
    process.env.BENCHMARKS_ROOT,
  ].filter(Boolean) as string[];

  for (const root of roots) {
    const path = join(root, ".env");
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env) || process.env[key] === "") {
        process.env[key] = val;
      }
    }
    break;
  }
}

export function resolveCursorApiKey(): string | undefined {
  loadDotEnv();
  const candidates = [
    "CURSOR_API_KEY",
    "CURSOR_SDK_KEY",
    "CURSOR_SDK",
    "CURSOR_API_TOKEN",
  ];
  for (const name of candidates) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return undefined;
}
