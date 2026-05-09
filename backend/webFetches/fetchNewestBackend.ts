import { fetch } from "@tauri-apps/api/http";

// We pull the macOS-aware standalone backend from biscock's fork. Upstream
// (suchmememanyskill/SDH-CssLoader) doesn't ship macOS artifacts \u2014 see
// docs at https://github.com/biscock/SDH-CssLoader for context.
const BACKEND_REPO = "biscock/SDH-CssLoader";

export async function fetchNewestBackend() {
  return await fetch<any>(
    `https://api.github.com/repos/${BACKEND_REPO}/releases/latest`
  )
    .then((res) => {
      return res.data;
    })
    .then((json) => {
      if (json) {
        return json;
      }
      return;
    })
    .catch((err) => {
      console.error("Error Fetching Latest Backend From Github!", err);
      return;
    });
}
