#!/usr/bin/env node
import { loadRuntimeEnv } from "../env.js";
loadRuntimeEnv();
import { installProcessStabilityHandlers } from "../swarm/process-stability.js";
installProcessStabilityHandlers("agent-runs-leaderboard");
import {
  runLeaderboardDaemonOnce,
  startLeaderboardDaemonLoop,
  stopLeaderboardDaemonLoop,
} from "../agent-runs-leaderboard/leaderboard-daemon-loop.js";
import { isLeaderboardDaemonAlwaysOn } from "../agent-runs-leaderboard/leaderboard-daemon-config.js";

const cmd = process.argv[2] ?? "start";

if (cmd === "stop") {
  const r = stopLeaderboardDaemonLoop();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.stopped ? 0 : 1);
}

if (cmd === "once") {
  await runLeaderboardDaemonOnce();
  process.exit(0);
}

if (!isLeaderboardDaemonAlwaysOn()) {
  console.error(
    "Set LI_AGENT_RUNS_LEADERBOARD_ALWAYS_ON=1 (and CURSOR_API_KEY) before starting",
  );
  process.exit(1);
}

const r = startLeaderboardDaemonLoop();
console.log(JSON.stringify(r, null, 2));
if (!r.started && r.message.includes("already running")) process.exit(0);
if (!r.started) process.exit(1);

console.error("agent-runs-leaderboard daemon running (long-lived SDK session) — Ctrl+C to stop");
process.on("SIGINT", () => {
  void Promise.resolve(stopLeaderboardDaemonLoop()).finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void Promise.resolve(stopLeaderboardDaemonLoop()).finally(() => process.exit(0));
});
await new Promise(() => {});
