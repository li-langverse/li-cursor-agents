import type { ControlPlaneState } from "../control-plane/types.js";
import type { ObserverState } from "./types.js";

export function loadObserverState(state: ControlPlaneState): ObserverState {
  return state.observer ?? { retry_counts: {} };
}

export function saveObserverState(state: ControlPlaneState, observer: ObserverState): void {
  state.observer = {
    ...observer,
    last_scan_at: new Date().toISOString(),
  };
}
