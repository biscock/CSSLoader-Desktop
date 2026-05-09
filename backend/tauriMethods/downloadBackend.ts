import { fetchNewestBackend } from "backend/webFetches";
import semver from "semver";
import { setStandaloneVersion } from "./setStandaloneVersion";

/**
 * Download + install the standalone backend for the current platform.
 *
 * Returns ``true`` on success and ``false`` on any failure (no matching
 * release asset, network error, or the Rust install step erroring out).
 * Callers MUST check the return value before showing success UI \u2014
 * silently resolving on failure misleads the user into thinking the
 * backend is installed when it isn't.
 */
export async function downloadBackend(): Promise<boolean> {
  const { invoke } = await import("@tauri-apps/api");

  const release = await fetchNewestBackend();
  if (!release) {
    console.error("downloadBackend: failed to fetch latest backend release metadata");
    return false;
  }

  // Pick the right release asset for this platform/arch. The Rust side knows
  // which substring to match against (e.g. ``Standalone-Headless.exe`` on
  // Windows, ``Standalone-Headless-macOS-arm64.zip`` on Apple Silicon).
  const pattern = await invoke<string>("get_backend_asset_pattern", {});
  const asset = release?.assets?.find((e: any) => e?.name?.includes(pattern));
  const url = asset?.browser_download_url;
  if (!url) {
    console.error(
      "downloadBackend: no release asset matched pattern",
      pattern,
      "in",
      release?.assets?.map((a: any) => a?.name)
    );
    return false;
  }

  const version = semver.clean(release?.tag_name || "v1.0.0") || "v1.6.0";
  console.log(url);
  const result = await invoke<string>("install_backend", {
    backendUrl: url,
  });
  if (result.includes("ERROR")) {
    console.error("downloadBackend: install_backend returned", result);
    return false;
  }
  setStandaloneVersion(version);
  return true;
}
