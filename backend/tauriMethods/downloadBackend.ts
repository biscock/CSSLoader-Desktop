import { fetchNewestBackend } from "backend/webFetches";
import semver from "semver";
import { setStandaloneVersion } from "./setStandaloneVersion";

export async function downloadBackend() {
  const { invoke } = await import("@tauri-apps/api");

  const release = await fetchNewestBackend();

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
    return;
  }

  const version = semver.clean(release?.tag_name || "v1.0.0") || "v1.6.0";
  console.log(url);
  const result = await invoke<string>("install_backend", {
    backendUrl: url,
  });
  if (!result.includes("ERROR")) {
    setStandaloneVersion(version);
  }
}
