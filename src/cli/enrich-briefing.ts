#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
if (!process.env.LI_CONTROL_PLANE_STORE?.trim()) {
  process.env.LI_CONTROL_PLANE_STORE = "disk";
}
import { enrichBriefingFile } from "../briefing/enrich-briefing-file.js";
import { resolveBenchmarksRoot } from "../preflight.js";

function parseArgs(argv: string[]): { benchmarksRoot?: string; briefingPath?: string; noMirror: boolean } {
  let benchmarksRoot: string | undefined;
  let briefingPath: string | undefined;
  let noMirror = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--benchmarks-root" && argv[i + 1]) benchmarksRoot = argv[++i];
    else if (a === "--briefing-path" && argv[i + 1]) briefingPath = argv[++i];
    else if (a === "--no-mirror") noMirror = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: enrich-briefing [--benchmarks-root PATH] [--briefing-path FILE] [--no-mirror]",
      );
      process.exit(0);
    }
  }
  return { benchmarksRoot, briefingPath, noMirror };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = resolveBenchmarksRoot(args.benchmarksRoot);
  if (!root) {
    console.error("BENCHMARKS_ROOT not found — pass --benchmarks-root");
    process.exit(1);
  }
  const result = await enrichBriefingFile({
    benchmarksRoot: root,
    briefingPath: args.briefingPath,
    mirrorToAgentsPackage: !args.noMirror,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
