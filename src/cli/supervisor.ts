#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { agentBackendLabel, shouldUseMock } from "../runner.js";
import { runSupervisorLoop } from "../supervisor/loop.js";
import { resolveBenchmarksRoot } from "../preflight.js";

function parseArgs(argv: string[]) {
  let mock = false;
  let once = false;
  let force = false;
  let benchmarksRoot: string | undefined;
  let intervalMs = Number(process.env.LI_SUPERVISOR_INTERVAL_MS ?? 300_000);
  let cooldownMs = Number(process.env.LI_SUPERVISOR_COOLDOWN_MS ?? 6 * 60 * 60 * 1000);
  let maxTasksPerTick = Number(process.env.LI_SUPERVISOR_MAX_TASKS ?? 2);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mock") mock = true;
    else if (a === "--once") once = true;
    else if (a === "--force") force = true;
    else if (a === "--benchmarks") benchmarksRoot = argv[++i];
    else if (a === "--interval-ms") intervalMs = Number(argv[++i]);
    else if (a === "--cooldown-ms") cooldownMs = Number(argv[++i]);
    else if (a === "--max-tasks") maxTasksPerTick = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: npm run supervisor [-- --mock] [-- --once] [-- --benchmarks PATH]`);
      process.exit(0);
    }
  }
  return { mock, once, force, benchmarksRoot, intervalMs, cooldownMs, maxTasksPerTick };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mock = shouldUseMock(args.mock);

  const benchmarks = resolveBenchmarksRoot(args.benchmarksRoot);
  console.error(
    `[supervisor] CLI starting — backend=${agentBackendLabel(mock)} once=${args.once} interval=${args.intervalMs}ms cooldown=${args.cooldownMs}ms benchmarks=${benchmarks ?? "(none)"}`,
  );
  console.error("[supervisor] Press Ctrl+C to stop. Tick lines appear below as [supervisor] tick: …");

  await runSupervisorLoop({
    benchmarksRoot: benchmarks,
    mock,
    once: args.once,
    force: args.force,
    intervalMs: args.intervalMs,
    cooldownMs: args.cooldownMs,
    maxTasksPerTick: args.maxTasksPerTick,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
