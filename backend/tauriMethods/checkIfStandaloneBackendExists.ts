// Whether the standalone CSSLoader headless backend is installed locally.
//
// The actual location depends on the OS (Windows Startup folder vs.
// ~/Library/Application Support/CssLoader on macOS). The Rust side knows
// which path to check, so we just delegate to ``check_backend_installed``.
export async function checkIfStandaloneBackendExists(): Promise<boolean> {
  const { invoke } = await import("@tauri-apps/api");
  try {
    return await invoke<boolean>("check_backend_installed", {});
  } catch {
    return false;
  }
}
