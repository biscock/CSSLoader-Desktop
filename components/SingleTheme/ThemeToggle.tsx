import { useState, useMemo, useContext, useEffect } from "react";
import { Flags, Theme } from "../../ThemeTypes";
import { ThemePatch } from "./ThemePatch";
import { RiArrowDownSFill, RiArrowUpSFill } from "react-icons/ri";
import { themeContext } from "@contexts/themeContext";
import { generatePreset, generatePresetFromThemeNames, setThemeState, toast } from "../../backend";
import { findMissingDeps, resolveAndDownloadMissingDeps } from "../../logic";
import { AlertDialog, ToggleSwitch } from "..";
import { twMerge } from "tailwind-merge";

function OptionalDepsModal({
  themeData,
  closeModal,
}: {
  themeData: Theme;
  closeModal: () => void;
}) {
  const { refreshThemes, selectedPreset } = useContext(themeContext);

  const [enableDeps, setEnableDeps] = useState(true);
  const [enableDepValues, setEnableDepValues] = useState(true);
  useEffect(() => {
    if (!enableDeps) setEnableDepValues(false);
  }, [enableDeps]);

  async function enableThemeOptDeps() {
    await setThemeState(themeData.name, true, enableDeps, enableDepValues);
    await refreshThemes();
    if (!selectedPreset) return;
    generatePresetFromThemeNames(selectedPreset.name, [
      ...selectedPreset.dependencies,
      themeData.name,
    ]);
  }

  const handleEnableDepsToggle = (v: boolean) => {
    setEnableDeps(v);
  };

  const handleEnableDepValuesToggle = (v: boolean) => {
    setEnableDepValues(v);
  };

  return (
    <>
      <AlertDialog
        dontClose
        defaultOpen
        title="Optional Dependencies"
        description={`${themeData.name} enables other themes to enhance its functionality. Disabling these dependencies is allowed but it may cause the theme to break in unexpected ways`}
        Content={
          <div className="flex flex-col items-start gap-2 px-4 pb-4 text-sm">
            <div className="flex items-center justify-center gap-2">
              <ToggleSwitch onChange={handleEnableDepsToggle} />
              <span>Enable dependencies</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <ToggleSwitch
                checked={enableDepValues}
                disabled={!enableDeps}
                onChange={handleEnableDepValuesToggle}
              />
              <span>Enable pre-configured settings for dependencies</span>
            </div>
          </div>
        }
        actionText={`Enable ${themeData.name}`}
        onAction={() => {
          enableThemeOptDeps();
          closeModal();
        }}
      />
    </>
  );
}

/**
 * Yes/No prompt asking the user whether to download an optional-dep theme's
 * missing dependencies before showing the existing OptionalDepsModal. Optional
 * deps are by definition optional, so we never want to silently download them
 * \u2014 but we also don't want the user toggling a theme on only to hit a degraded
 * experience because the optional themes weren't on disk. Hence: ask first.
 */
function OptionalDepsDownloadPrompt({
  themeName,
  missing,
  onAnswer,
}: {
  themeName: string;
  missing: string[];
  onAnswer: (download: boolean) => void;
}) {
  return (
    <AlertDialog
      dontClose
      defaultOpen
      title="Download optional themes?"
      description={`${themeName} can also enable ${
        missing.length === 1 ? "1 optional theme" : `${missing.length} optional themes`
      } that ${missing.length === 1 ? "isn't" : "aren't"} installed locally yet:\n\n${missing.join(
        ", "
      )}`}
      cancelText="No"
      actionText="Yes"
      CustomAction={
        <>
          <button
            className="font-fancy my-2 mx-2 ml-auto rounded-2xl bg-base-5.5-dark p-2 px-6"
            onClick={() => onAnswer(false)}
          >
            No
          </button>
          <button
            className="font-fancy my-2 mr-2 rounded-2xl bg-brandBlue p-2 px-6"
            onClick={() => onAnswer(true)}
          >
            Yes
          </button>
        </>
      }
    />
  );
}

export function ThemeToggle({
  data,
  collapsible = false,
  rootClass = "",
}: {
  data: Theme;
  collapsible?: boolean;
  rootClass?: string;
}) {
  const { refreshThemes, selectedPreset, themes } = useContext(themeContext);
  const [showOptDepsModal, setShowOptDepsModal] = useState<boolean>(false);
  // Missing optional deps surfaced by the most recent toggle; ``null`` means
  // we're not currently asking. Held outside ``showOptDepsModal`` because the
  // prompt fires *before* the existing modal and feeds into it.
  const [missingOptDeps, setMissingOptDeps] = useState<string[] | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(true);
  const isPreset = useMemo(() => {
    if (data.flags.includes(Flags.isPreset)) {
      return true;
    }
    return false;
    // This might not actually memoize it as data.flags is an array, so idk if it deep checks the values here
  }, [data.flags]);

  return (
    <div
      className={twMerge(
        "flex w-full max-w-[960px] flex-col gap-1 rounded-xl border-2 border-borders-base1-dark bg-base-3-dark p-6 transition hover:border-borders-base2-dark",
        rootClass
      )}
    >
      {showOptDepsModal && (
        <OptionalDepsModal themeData={data} closeModal={() => setShowOptDepsModal(false)} />
      )}
      {missingOptDeps && missingOptDeps.length > 0 && (
        <OptionalDepsDownloadPrompt
          themeName={data.display_name || data.name}
          missing={missingOptDeps}
          onAnswer={async (download) => {
            // Whichever the user picks, the prompt closes; we then fall
            // through to the existing OptionalDepsModal so they can pick
            // which (now-installed) deps to enable.
            setMissingOptDeps(null);
            if (download) {
              const result = await resolveAndDownloadMissingDeps(
                data.dependencies,
                themes,
                ({ current, total, themeName }) =>
                  toast(`Downloading ${current} of ${total}`, themeName)
              );
              if (result.downloaded.length > 0) {
                // Same reasoning as the required-deps path: the backend
                // needs to rescan disk before the OptionalDepsModal's
                // ``setThemeState`` call can resolve the new deps.
                await refreshThemes(true);
              }
              if (result.notFound.length > 0) {
                toast(
                  "Some optional themes could not be found",
                  result.notFound.join(", ")
                );
              }
              if (result.failed.length > 0) {
                toast(
                  "Some optional themes failed to download",
                  result.failed.join(", ")
                );
              }
            }
            setShowOptDepsModal(true);
          }}
        />
      )}
      <div className="flex justify-between gap-4">
        <div className="flex flex-col">
          <span className="font-fancy text-md font-bold">{data?.display_name || data.name}</span>
          <span className="font-fancy text-muted text-sm">
            {isPreset ? `Preset` : `${data.version} • ${data.author}`}
          </span>
        </div>

        <>
          <ToggleSwitch
            checked={data.enabled}
            onChange={async (switchValue) => {
              // TODO: redo this!

              // Re-collapse menu
              setCollapsed(true);
              // If theme has optional dependency flag, branch into the
              // optional-deps flow. If any of those optional deps aren't
              // installed locally yet, ask the user first \u2014 we never
              // silently download "optional" things, and we never want
              // them to land in the OptionalDepsModal with deps the
              // backend doesn't know about. If everything is already
              // installed (or the theme has no deps), fall straight
              // through to the existing modal as before.
              if (switchValue === true && data.flags.includes(Flags.optionalDeps)) {
                const missing = findMissingDeps(data.dependencies, themes);
                if (missing.length > 0) {
                  setMissingOptDeps(missing);
                } else {
                  setShowOptDepsModal(true);
                }
                return;
              }
              // When enabling a theme/preset, auto-download any of its
              // dependencies that aren't installed locally yet. We do this
              // BEFORE setThemeState so the backend never sees a "preset
              // refers to a theme we don't have" state. Toasts surface
              // progress to the user; nothing here is fatal \u2014 themes that
              // can't be located/downloaded are reported at the end and the
              // preset is still applied with whatever made it through.
              if (switchValue && data.dependencies.length > 0) {
                const result = await resolveAndDownloadMissingDeps(
                  data.dependencies,
                  themes,
                  ({ current, total, themeName }) =>
                    toast(`Downloading ${current} of ${total}`, themeName)
                );
                if (result.downloaded.length > 0) {
                  // ``refreshThemes(true)`` triggers ``reloadBackend()`` which
                  // makes the backend rescan disk for newly written theme
                  // folders. Without the ``true`` flag the backend would just
                  // return its cached in-memory list and the freshly
                  // downloaded deps would be invisible to the next
                  // ``setThemeState`` call — making the whole feature a no-op.
                  await refreshThemes(true);
                }
                if (result.notFound.length > 0) {
                  toast(
                    "Some dependencies could not be found",
                    result.notFound.join(", ")
                  );
                }
                if (result.failed.length > 0) {
                  toast(
                    "Some dependencies failed to download",
                    result.failed.join(", ")
                  );
                }
              }
              // Actually enabling the theme
              await setThemeState(data.name, switchValue);

              // Need to grab up to date data
              const updatedThemes: Theme[] | undefined = await refreshThemes();

              // Dependency Toast
              if (data.dependencies.length > 0) {
                if (switchValue) {
                  toast(
                    `${data.name} enabled other themes`,
                    `${
                      data.dependencies.length === 1
                        ? `1 other theme is required by ${data.name}`
                        : `${data.dependencies.length} other themes are required by ${data.name}`
                    }`
                  );
                }
                if (!switchValue && !data.flags.includes(Flags.dontDisableDeps)) {
                  toast(
                    `${data.name} disabled other themes`,
                    // @ts-ignore
                    `${
                      data.dependencies.length === 1
                        ? `1 theme was originally enabled by ${data.name}`
                        : `${data.dependencies.length} themes were originally enabled by ${data.name}`
                    }`
                  );
                }
              }

              if (!selectedPreset || !updatedThemes) return;
              // This used to generate the new list of themes by the dependencies of the preset + or - the checked theme
              // However, since we added profiles, the list of enabled themes IS the list of dependencies, so this works
              await generatePresetFromThemeNames(
                selectedPreset.name,
                updatedThemes
                  .filter((e) => e.enabled && !e.flags.includes(Flags.isPreset))
                  .map((e) => e.name)
              );
            }}
          />
        </>
      </div>
      {data.enabled && data.patches.length > 0 && (
        <>
          <div className="mt-4 flex w-full max-w-[960px] flex-col gap-2 rounded-lg px-4 py-2 dark:bg-cardDark">
            {collapsible && (
              <div className="relative flex flex-row items-center py-2">
                <h3 className="font-fancy flex flex-1 items-center gap-2 text-xs font-bold">
                  Theme Settings
                </h3>
                <button
                  className="absolute inset-0 flex items-center justify-end"
                  aria-controls="content"
                  onClick={() => setCollapsed(!collapsed)}
                >
                  {collapsed ? (
                    <RiArrowDownSFill
                      className="flex"
                      style={{
                        fontSize: "1.5em",
                      }}
                    />
                  ) : (
                    <RiArrowUpSFill
                      style={{
                        fontSize: "1.5em",
                      }}
                    />
                  )}
                </button>
              </div>
            )}
            {!collapsible || !collapsed ? (
              <div className="flex flex-col ">
                {data.patches.map((x, i, arr) => {
                  return (
                    <ThemePatch
                      key={`ThemePatch_${data.name}_${i}`}
                      data={x}
                      index={i}
                      fullArr={arr}
                      themeName={data.name}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
