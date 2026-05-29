import type { ChildProcess } from "node:child_process";

const tracked = new Map<number, ChildProcess>();

/** Register a child process so SIGTERM shutdown can terminate maintenance/gh/python work. */
export function trackManagedSubprocess(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;
  tracked.set(pid, child);
  child.once("exit", () => {
    tracked.delete(pid);
  });
}

export function managedSubprocessCount(): number {
  return tracked.size;
}

function killPid(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    /* already exited */
  }
}

/** Send signal to all tracked children (and their process groups when possible). */
export function killManagedSubprocesses(signal: NodeJS.Signals = "SIGTERM"): void {
  for (const [pid, child] of tracked) {
    killPid(pid, signal);
    if (child.pid) {
      try {
        process.kill(-child.pid, signal);
      } catch {
        /* not a group leader */
      }
    }
  }
}

export async function killManagedSubprocessesAndWait(
  graceMs = 5_000,
  signal: NodeJS.Signals = "SIGTERM",
): Promise<number> {
  if (tracked.size === 0) return 0;
  killManagedSubprocesses(signal);
  const deadline = Date.now() + graceMs;
  while (tracked.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (tracked.size > 0) {
    killManagedSubprocesses("SIGKILL");
    await new Promise((r) => setTimeout(r, 200));
  }
  const remaining = tracked.size;
  tracked.clear();
  return remaining;
}
