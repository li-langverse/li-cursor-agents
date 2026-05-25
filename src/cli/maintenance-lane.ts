#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { maintenanceLaneTick, runMaintenanceLaneLoop } from "../lanes/maintenance-lane.js";

function parseArgs(argv: string[]) {
  let once = false;
  for (const a of argv) {
    if (a === "--once") once = true;
    if (a === "--help" || a === "-h") {
      console.log("Usage: maintenance-lane [--once]");
      process.exit(0);
    }
  }
  return { once };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.once) {
    const tick = await maintenanceLaneTick();
    console.log(JSON.stringify(tick, null, 2));
    process.exit(tick.ok ? 0 : 1);
  }
  await runMaintenanceLaneLoop(true);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
