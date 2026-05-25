#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { implementLaneTick, runImplementLaneLoop } from "../lanes/implement-lane.js";
import { shouldUseMock } from "../runner.js";

function parseArgs(argv: string[]) {
  let once = false;
  let mock = false;
  for (const a of argv) {
    if (a === "--once") once = true;
    if (a === "--mock") mock = true;
    if (a === "--help" || a === "-h") {
      console.log(`Usage: implement-lane [--once] [--mock]
Env: LI_IMPLEMENT_LANE_INTERVAL_MS, LI_IMPLEMENT_LANE_ENABLED=0 to disable`);
      process.exit(0);
    }
  }
  return { once, mock: mock || shouldUseMock(false) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.once) {
    const tick = await implementLaneTick({ mock: args.mock });
    console.log(JSON.stringify(tick, null, 2));
    return;
  }
  await runImplementLaneLoop({ mock: args.mock, once: false });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
