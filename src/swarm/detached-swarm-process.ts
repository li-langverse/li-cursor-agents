import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { workerConsole } from "../worker/worker-console.js";

let managedChild: ChildProcess | null = null;

export function detachedSwarmEnabled(): boolean {
  return (
    process.env.LI_SWARM_DETACHED === "1" || process.env.LI_SWARM_DETACHED === "true"
  );
}

/** When set, serve-dashboard does not start swarm; use swarm-dev.sh or spawnDetachedAsyncSwarm(). */
export function externalSwarmRunnerEnabled(): boolean {
  return (
    process.env.LI_SWARM_EXTERNAL === "1" ||
    process.env.LI_SWARM_EXTERNAL === "true" ||
    detachedSwarmEnabled()
  );
}

function pidFilePath(): string {
  return join(agentsPackageRoot(), "logs", "async-swarm.pid");
}

function swarmLogPath(): string {
  return join(agentsPackageRoot(), "logs", "async-swarm-dev.log");
}

function pidOnDisk(): number | null {
  const path = pidFilePath();
  if (!existsSync(path)) return null;
  const n = Number(readFileSync(path, "utf8").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isDetachedSwarmChildRunning(): boolean {
  if (managedChild && managedChild.exitCode === null && !managedChild.killed) {
    return true;
  }
  const pid = pidOnDisk();
  if (pid == null) return false;
  if (!processAlive(pid)) {
    try {
      unlinkSync(pidFilePath());
    } catch {
      /* */
    }
    return false;
  }
  return true;
}

export function spawnDetachedAsyncSwarm(): { started: boolean; message: string; pid?: number } {
  if (isDetachedSwarmChildRunning()) {
    return { started: false, message: "detached async swarm already running" };
  }

  const root = agentsPackageRoot();
  mkdirSync(join(root, "logs"), { recursive: true });
  const logPath = swarmLogPath();
  appendFileSync(logPath, `\n── detached swarm ${new Date().toISOString()} ──\n`);

  const out = openSync(logPath, "a");
  const child = spawn(process.execPath, [join(root, "dist/cli/async-swarm.js"), "start"], {
    cwd: root,
    env: {
      ...process.env,
      LI_SWARM_DETACHED: "0",
      LI_SWARM_EXTERNAL: "0",
    },
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
  managedChild = child;

  if (!child.pid) {
    return { started: false, message: "failed to spawn detached async swarm" };
  }

  writeFileSync(pidFilePath(), `${child.pid}\n`, "utf8");
  workerConsole("async-swarm", "info", `detached swarm pid=${child.pid} log=${logPath}`);
  return { started: true, message: `detached async swarm pid=${child.pid}`, pid: child.pid };
}

export function stopDetachedAsyncSwarm(): { stopped: boolean; message: string } {
  const pid = managedChild?.pid ?? pidOnDisk();
  managedChild = null;
  try {
    unlinkSync(pidFilePath());
  } catch {
    /* */
  }
  if (pid == null) {
    return { stopped: false, message: "detached async swarm not running" };
  }
  if (!processAlive(pid)) {
    return { stopped: true, message: `detached swarm already exited (pid=${pid})` };
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { stopped: false, message: `kill failed: ${msg}` };
  }
  workerConsole("async-swarm", "info", `sent SIGTERM to detached swarm pid=${pid}`);
  return { stopped: true, message: `stopped detached swarm pid=${pid}` };
}
