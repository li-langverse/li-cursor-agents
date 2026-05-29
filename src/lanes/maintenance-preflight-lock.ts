let preflightInFlight = false;

export function isMaintenancePreflightInFlight(): boolean {
  return preflightInFlight;
}

export async function withMaintenancePreflightLock<T>(fn: () => Promise<T>): Promise<T> {
  if (preflightInFlight) {
    throw new Error("maintenance preflight already in flight");
  }
  preflightInFlight = true;
  try {
    return await fn();
  } finally {
    preflightInFlight = false;
  }
}
