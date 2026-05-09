import { fetch } from "@tauri-apps/api/http";
import { apiUrl } from "../constants";
import { MinimalCSSThemeInfo, Theme } from "../ThemeTypes";
import { downloadThemeFromUrl } from "../backend";

export interface DepDownloadProgress {
  /** 1-based index of the dep currently being downloaded */
  current: number;
  /** total number of deps that need to be downloaded */
  total: number;
  /** human-readable name of the dep currently being downloaded */
  themeName: string;
}

export interface DepDownloadResult {
  /** Deps that were not present locally and were successfully fetched. */
  downloaded: string[];
  /** Deps that were not present locally and could not be located on the store. */
  notFound: string[];
  /** Deps that were located on the store but failed to download. */
  failed: string[];
}

/**
 * Look up the supplied dependency names against the deckthemes store.
 *
 * The Theme Store's ``/themes/ids`` endpoint accepts a dot-separated list of
 * theme ids OR theme names and returns matching ``MinimalCSSThemeInfo``
 * entries; matching by name is what we rely on, since a preset's
 * ``theme.json`` references its dependencies by display name (e.g.
 * ``"Some Theme By X 2.1"``).
 *
 * We deliberately do NOT batch all names into a single ``?ids=A.B.C``
 * request: theme display names can contain literal periods (e.g.
 * ``"Krongraphics 2.0"``), and the API splits the ``ids`` parameter on
 * ``.`` server-side, which would corrupt every name with a dot in it. We
 * also need ``encodeURIComponent`` to handle spaces, ``&``, ``#``, ``+``
 * and other URL-significant characters that show up freely in display
 * names. So instead we issue one request per name in parallel \u2014 the
 * deckthemes API is fine with this, and 30-ish parallel HTTPS calls take
 * about the same wall-clock time as a single batched call.
 */
async function fetchThemesByNames(names: string[]): Promise<MinimalCSSThemeInfo[]> {
  if (names.length === 0) return [];

  const requests = names.map(async (name) => {
    try {
      const queryStr = "?ids=" + encodeURIComponent(name);
      const res = await fetch<MinimalCSSThemeInfo[]>(`${apiUrl}/themes/ids${queryStr}`);
      // The endpoint returns an array even for a single id; pick the
      // first entry whose name or id matches what we asked for. This is
      // belt-and-braces in case the API ever decides to fuzzy-match.
      const data = res.data ?? [];
      return data.find((d) => d.name === name || d.id === name) ?? null;
    } catch (err) {
      console.error(`Failed to query store for dependency "${name}":`, err);
      return null;
    }
  });

  const results = await Promise.all(requests);
  return results.filter((r): r is MinimalCSSThemeInfo => r !== null);
}

/**
 * Resolve the supplied list of theme dependency names against the locally
 * installed themes; for any that aren't already installed, look them up on
 * the store and download them.
 *
 * @param depNames     Theme names from a preset/theme's ``dependencies`` field.
 * @param installedThemes  Currently installed themes (``themeContext.themes``).
 * @param onProgress   Called once per actual download, with 1-based
 *                     ``current`` and the resolved store name. Use this to
 *                     surface a toast like ``Downloading X of Y: <name>``.
 *
 * The returned ``downloaded`` list contains names that were freshly fetched.
 * ``notFound`` contains names that weren't on the store at all (the caller
 * should show these to the user). ``failed`` contains names that were on
 * the store but whose download itself errored \u2014 those are typically
 * transient and worth a separate toast.
 */
export async function resolveAndDownloadMissingDeps(
  depNames: string[],
  installedThemes: Theme[],
  onProgress?: (p: DepDownloadProgress) => void
): Promise<DepDownloadResult> {
  // Fast path: nothing to do if the preset has no deps at all.
  if (depNames.length === 0) {
    return { downloaded: [], notFound: [], failed: [] };
  }

  // De-duplicate while preserving the original order so progress toasts read
  // naturally if the same name happens to appear twice.
  const uniqueDeps = Array.from(new Set(depNames));

  const installedSet = new Set(installedThemes.map((t) => t.name));
  const missing = uniqueDeps.filter((name) => !installedSet.has(name));

  // Fast path: every dep is already installed locally.
  if (missing.length === 0) {
    return { downloaded: [], notFound: [], failed: [] };
  }

  const remoteEntries = await fetchThemesByNames(missing);

  const downloaded: string[] = [];
  const notFound: string[] = [];
  const failed: string[] = [];

  // Iterate by the original ``missing`` order so the user sees a stable
  // progress sequence regardless of how the API orders its response.
  let downloadedSoFar = 0;
  const totalToDownload = missing.filter((name) =>
    remoteEntries.some((r) => r.name === name || r.id === name)
  ).length;

  for (const name of missing) {
    const remote = remoteEntries.find((r) => r.name === name || r.id === name);
    if (!remote) {
      notFound.push(name);
      continue;
    }

    downloadedSoFar += 1;
    onProgress?.({
      current: downloadedSoFar,
      total: totalToDownload,
      themeName: remote.name,
    });

    try {
      const res = await downloadThemeFromUrl(remote.id);
      // ``download_theme_from_url`` (Python plugin) resolves to a structure
      // shaped like ``{ success: boolean, result?: any }``. We treat anything
      // other than an explicit ``success: false`` as a successful install,
      // since older backend versions return only a string on success.
      if (res && res.success === false) {
        failed.push(name);
      } else {
        downloaded.push(name);
      }
    } catch (e) {
      console.error(`Failed to download dep "${name}":`, e);
      failed.push(name);
    }
  }

  return { downloaded, notFound, failed };
}
