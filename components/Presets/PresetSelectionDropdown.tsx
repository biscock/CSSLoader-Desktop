import { useContext, useMemo, useState } from "react";
import { CreatePresetModal, RadioDropdown, Tooltip } from "..";
import { themeContext } from "@contexts/themeContext";
import { Flags } from "ThemeTypes";
import { changePreset, deletePreset, setThemeState, toast } from "backend";
import { resolveAndDownloadMissingDeps } from "../../logic";
import { MenuDropdown } from "@components/Primitives/MenuDropdown";
import { BiTrash } from "react-icons/bi";
import { twMerge } from "tailwind-merge";

export function PresetSelectionDropdown() {
  const { themes, refreshThemes, selectedPreset } = useContext(themeContext);
  const presets = useMemo(() => themes.filter((e) => e.flags.includes(Flags.isPreset)), [themes]);
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="flex w-full items-center justify-center gap-4">
        {showModal && <CreatePresetModal closeModal={() => setShowModal(false)} />}
        <RadioDropdown
          triggerClass="bg-base-5.5-dark"
          headingText="Selected Profile"
          ariaLabel="Profile Selection Dropdown"
          value={
            themes.filter((e) => e.flags.includes(Flags.isPreset) && e.enabled).length > 1
              ? "Invalid State"
              : selectedPreset?.display_name || selectedPreset?.name || "None"
          }
          options={[
            // This just ensures that default profile is the first result
            ...(themes.filter((e) => e.flags.includes(Flags.isPreset) && e.enabled).length > 1
              ? ["Invalid State"]
              : []),
            "None",
            ...presets.map((e) => e?.display_name || e.name),
            "New Profile",
          ]}
          onValueChange={async (e) => {
            if (e === "New Profile") {
              setShowModal(true);
              return;
            }
            if (e === "Invalid State") return;
            if (e === "None") {
              await changePreset(e, themes);
              // Pre-existing fall-through bug: without this return, "None"
              // continues into the themes.find() lookup below and the new
              // dep-download code, which would fire network requests if any
              // theme happened to be named "None".
              refreshThemes();
              return;
            }
            // since e is the display_name, and toggle uses the real name, need to find that...
            // Still checks name as a fallback
            const themeEntry = themes.find((f) => f?.display_name === e || f.name === e);
            if (themeEntry) {
              // Auto-download any of the preset's dependencies that aren't
              // installed locally yet. Done BEFORE changePreset so the
              // backend always sees a fully-resolved dep set when it
              // enables the preset. Toasts mirror the ones in ThemeToggle.
              if (themeEntry.dependencies.length > 0) {
                const result = await resolveAndDownloadMissingDeps(
                  themeEntry.dependencies,
                  themes,
                  ({ current, total, themeName }) =>
                    toast(`Downloading ${current} of ${total}`, themeName)
                );
                if (result.downloaded.length > 0) {
                  // ``refreshThemes(true)`` triggers ``reloadBackend()`` which
                  // makes the backend rescan disk for newly written theme
                  // folders. Without the ``true`` flag the backend would just
                  // return its cached in-memory list and the freshly
                  // downloaded deps would be invisible to the subsequent
                  // ``changePreset`` call \u2014 making the whole feature a no-op.
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
              await changePreset(themeEntry.name, themes);
            }
            refreshThemes();
          }}
        />

        <MenuDropdown
          triggerDisabled={!selectedPreset}
          align="end"
          options={[
            {
              displayText: "Delete Profile",
              icon: <BiTrash size={20} />,
              onSelect: async () => {
                deletePreset(selectedPreset!.name, themes, refreshThemes);
              },
            },
          ]}
          triggerClass={twMerge(
            "h-12 w-12 self-end rounded-xl border-2 border-borders-base1-dark bg-base-5.5-dark transition-all hover:border-borders-base2-dark",
            !selectedPreset && "opacity-50"
          )}
        />
      </div>
    </>
  );
}
