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
 * We use the path-segment endpoint ``GET /themes/{id}`` rather than the
 * batched ``GET /themes/ids?ids=A.B.C`` endpoint. Why:
 *
 *  - ``/themes/ids`` splits its ``ids`` query parameter on ``.``
 *    server-side (verified in CssLoader-ThemeApi/ThemeController.cs:64
 *    \u2014 ``ids.Split('.')``). ASP.NET URL-decodes the query value
 *    *before* this split, so ``%2E`` doesn't survive either; theme names
 *    with literal periods (e.g. ``"ModernDeck.profile"``,
 *    ``"Krongraphics 2.0"``) end up shredded into pieces that don't
 *    match any theme, and the dep gets misclassified as ``notFound``.
 *  - ``/themes/{id}`` matches by ID *or* name (verified in
 *    ThemeService.cs:212 \u2014 ``theme ??= db.FirstOrDefault(x => x.Name
 *    == id ...)``), and ASP.NET path-segment routing keeps dots intact
 *    \u2014 ``GET /themes/ModernDeck.profile`` correctly resolves the theme
 *    while ``GET /themes/ids?ids=ModernDeck.profile`` returns ``[]``.
 *  - ``encodeURIComponent`` handles spaces, ``&``, ``#``, ``+`` and other
 *    URL-significant characters that appear freely in display names.
 *
 * Returns ``FullCssThemeDto`` rather than ``MinimalCssThemeDto`` (a
 * superset \u2014 has ``id`` + ``name`` which is all we use), 404s when the
 * theme doesn't exist, so we map a missing result to ``null`` and let
 * the caller bucket it under ``notFound``.
 *
 * We issue one request per name in parallel: the deckthemes API is fine
 * with this, and 30-ish parallel HTTPS calls take about the same
 * wall-clock time as a single batched call.
 */
async function fetchThemesByNames(names: string[]): Promise<MinimalCSSThemeInfo[]> {
  if (names.length === 0) return [];

  const requests = names.map(async (name) => {
    try {
      const res = await fetch<MinimalCSSThemeInfo>(
        `${apiUrl}/themes/${encodeURIComponent(name)}`
      );
      // ``/themes/{id}`` returns 404 when the theme isn't found. The
      // Tauri http plugin doesn't throw on non-2xx by default; check
      // ``ok`` and the shape of the body before trusting it.
      if (!res.ok || !res.data || typeof res.data !== "object" || !res.data.id) {
        return null;
      }
      // Belt-and-braces: only return a hit if the response actually
      // matches what we asked for. ASP.NET routing should never give us
      // a different theme back, but if it ever fuzzy-matches we don't
      // want to silently install the wrong thing.
      if (res.data.name !== name && res.data.id !== name) return null;
      return res.data;
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
/**
 * Pure (no-network) helper that returns the subset of ``depNames`` not
 * present in ``installedThemes``. Useful when the caller wants to decide
 * whether to even prompt the user before kicking off a download \u2014
 * specifically for the optional-deps flow, where we ask "Download
 * optional themes?" only when there's actually something to download.
 *
 * Match installed themes against either their internal ``name`` (folder
 * name) or their human-facing ``display_name``. Preset dependencies are
 * generated from ``e.name`` so they always hit the first form, but a
 * hand-authored theme.json may list dependencies by display name; without
 * matching both we'd re-download themes that are already installed under
 * a different internal name.
 */
export function findMissingDeps(depNames: string[], installedThemes: Theme[]): string[] {
  if (depNames.length === 0) return [];
  const uniqueDeps = Array.from(new Set(depNames));
  const installedSet = new Set<string>();
  for (const t of installedThemes) {
    if (t.name) installedSet.add(t.name);
    if (t.display_name) installedSet.add(t.display_name);
  }
  return uniqueDeps.filter((name) => !installedSet.has(name));
}

export async function resolveAndDownloadMissingDeps(
  depNames: string[],
  installedThemes: Theme[],
  onProgress?: (p: DepDownloadProgress) => void
): Promise<DepDownloadResult> {
  // Fast path: nothing to do if the preset has no deps at all.
  if (depNames.length === 0) {
    return { downloaded: [], notFound: [], failed: [] };
  }

  const missing = findMissingDeps(depNames, installedThemes);

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
