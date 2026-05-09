import { dummyFunction } from "backend/pythonMethods";

// Module-scoped in-flight guard. Both the recursive auto-restart loop
// (every 5s while the backend is unresponsive) and the manual "Force
// Restart Backend" button can call ``startBackend`` concurrently. The
// ``dummyFunction`` check below is not atomic on its own \u2014 two callers
// arriving within the same poll tick can both see ``isRunning === false``
// and both invoke ``start_backend``, producing two competing spawns. We
// reuse the same Promise across overlapping callers so they all wait for
// the single in-flight invocation.
let inFlight: Promise<string | undefined> | null = null;

export async function startBackend() {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // The backend's "dummy" check answers if the headless process is
      // alive and responding on its local CDP-style endpoint. If it's
      // already running we don't need to start a second copy.
      const isRunning = await dummyFunction();
      if (isRunning) return undefined;
      const { invoke } = await import("@tauri-apps/api");
      return await invoke<string>("start_backend", {});
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
