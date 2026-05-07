import { dummyFunction } from "backend/pythonMethods";

export async function startBackend() {
  // The backend's "dummy" check answers if the headless process is alive and
  // responding on its local CDP-style endpoint. If it's already running we
  // don't need to start a second copy.
  const isRunning = await dummyFunction();
  if (isRunning) return;
  const { invoke } = await import("@tauri-apps/api");
  return await invoke<string>("start_backend", {});
}
