#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { runSwarmWatchdogTick } from "../swarm/swarm-watchdog.js";

const r = await runSwarmWatchdogTick();
if (r.health_path) console.log(`swarm-health: ${r.health_path}`);
console.log(`watchdog: ${r.message}`);
process.exit(r.ok ? 0 : 1);
