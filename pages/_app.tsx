import "../styles/globals.css";
import type { AppProps } from "next/app";
import { Flags, Theme, ThemeError } from "../ThemeTypes";
import { useState, useEffect, useMemo, useRef, use } from "react";
import "react-toastify/dist/ReactToastify.css";
import {
  checkForNewBackend,
  checkIfStandaloneBackendExists,
  checkIfBackendIsStandalone,
  dummyFunction,
  reloadBackend,
  startBackend,
  recursiveCheck,
  getInstalledThemes,
  getOS,
  generatePresetFromThemeNames,
  getLastLoadErrors,
  changePreset,
  getBackendVersion,
} from "../backend";
import { themeContext } from "@contexts/themeContext";
import { FontContext } from "@contexts/FontContext";
import { backendStatusContext } from "@contexts/backendStatusContext";
import { AppRoot } from "@components/AppRoot";
import DynamicTitleBar from "@components/Native/DynamicTitlebar";
import { AppFrame } from "@components/Native/AppFrame";
import { osContext } from "@contexts/osContext";
import { useBasicAsyncEffect } from "@hooks/useBasicAsyncEffect";

export default function App(AppProps: AppProps) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [errors, setErrors] = useState<ThemeError[]>([]);
  // This is now undefined before the initial check, that way things can use dummyResult !== undefined to see if the app has properly loaded
  const [dummyResult, setDummyResult] = useState<boolean | undefined>(undefined);
  const [backendExists, setBackendExists] = useState<boolean>(false);
  const [newBackendVersion, setNewBackend] = useState<string>("");
  const [showNewBackendPage, setShowNewBackend] = useState<boolean>(false);
  const [backendManifestVersion, setManifestVersion] = useState<number>(8);
  const [OS, setOS] = useState<string>("");
  const isWindows = useMemo(() => OS === "win32", [OS]);
  const isMacOS = useMemo(() => OS === "darwin", [OS]);
  // Linux runs CSSLoader as a Decky plugin, so the Desktop app stays out of
  // backend lifecycle management there.
  const isManagedBackend = useMemo(() => isWindows || isMacOS, [isWindows, isMacOS]);
  // ``recheckDummy`` is kicked off once on mount before ``getOS`` has
  // resolved, which means any closure capturing ``isManagedBackend`` then
  // sees ``false`` forever. We mirror it into a ref so the polling loop's
  // callbacks can read the current value at the moment they fire.
  const isManagedBackendRef = useRef(isManagedBackend);
  useEffect(() => {
    isManagedBackendRef.current = isManagedBackend;
  }, [isManagedBackend]);
  const [maximized, setMaximized] = useState<boolean>(false);
  const [fullscreen, setFullscreen] = useState<boolean>(false);

  const selectedPreset = useMemo(
    () => themes.find((e) => e.flags.includes(Flags.isPreset) && e.enabled),
    [themes]
  );

  useEffect(() => {
    let unsubscribeToWindowChanges: () => void;

    async function subscribeToWindowChanges() {
      // why did you use a ssr framework in an app
      const { appWindow } = await import("@tauri-apps/api/window");
      unsubscribeToWindowChanges = await appWindow.onResized(() => {
        appWindow.isMaximized().then(setMaximized);
        appWindow.isFullscreen().then(setFullscreen);
      });
    }

    subscribeToWindowChanges();

    // This sets OS and isWindows, which some other initializing logic then runs based on that result
    getOS().then(setOS);
    // This actually initializes the themes and such
    recheckDummy();

    return () => {
      unsubscribeToWindowChanges && unsubscribeToWindowChanges();
    };
  }, []);

  useBasicAsyncEffect(async () => {
    if (!isManagedBackend) return;
    refreshBackendExists();
    const isStandalone = await checkIfBackendIsStandalone();
    if (!isStandalone) return;
    const newStandalone = await checkForNewBackend();
    if (!newStandalone) return;
    setNewBackend(newStandalone as string);
    setShowNewBackend(true);
  }, [isManagedBackend]);

  async function recheckDummy() {
    recursiveCheck(
      dummyFuncTest,
      () => refreshThemes(true),
      // Read isManagedBackend off the ref \u2014 this callback gets captured
      // at mount time, before ``getOS()`` has resolved. Without the ref the
      // value is locked to ``false`` for the lifetime of the loop.
      () => isManagedBackendRef.current && startBackend(),
      // Persistent-failure hook: if the dummy never comes back after the
      // initial spawn, re-run startBackend every 5s. The standalone backend
      // can quit during init on macOS when Steam isn't running yet (the
      // CDP-attach call fails), so this loops until the user has both the
      // backend AND Steam up \u2014 no manual "Force Restart Backend" click
      // required.
      () => isManagedBackendRef.current && startBackend(),
      5
    );
  }

  async function refreshBackendExists() {
    // Same closure caveat as ``refreshThemes`` / ``recheckDummy``: this
    // function is reached via the ``onTrue`` callback that's captured at
    // mount time before getOS() resolves. Without the ref the early
    // return fires every time and ``backendExists`` is left at its
    // mount-time false on Windows/macOS.
    if (!isManagedBackendRef.current) return;
    const backendExists = await checkIfStandaloneBackendExists();
    setBackendExists(backendExists);
  }

  async function dummyFuncTest() {
    try {
      const data = await dummyFunction();
      if (!data || !data.success) throw new Error(undefined);
      setDummyResult(data.result);
      return true;
    } catch {
      setDummyResult(false);
      return false;
    }
  }

  async function refreshThemes(reset: boolean = false): Promise<Theme[] | undefined> {
    // Read off the ref \u2014 same reason as ``recheckDummy``: the recursive
    // dummy-poll captures ``refreshThemes`` at mount time when
    // ``isManagedBackend`` is still false, so we'd otherwise never call
    // ``refreshBackendExists`` on the very first successful poll for
    // Windows/macOS, leaving ``backendExists`` mis-set on the initial load.
    if (isManagedBackendRef.current) await refreshBackendExists();
    await dummyFuncTest();
    const backendVer = await getBackendVersion();
    if (backendVer.success) {
      setManifestVersion(backendVer.result);
    }

    const data = reset ? await reloadBackend() : await getInstalledThemes();
    if (data) {
      setThemes(data.sort());
    }
    const errors = await getLastLoadErrors();
    if (errors) {
      setErrors(errors);
    }

    // Returning themes for preset thingy thingy
    return data?.sort();
  }

  return (
    <themeContext.Provider
      value={{ themes, setThemes, errors, setErrors, refreshThemes, selectedPreset }}
    >
      <backendStatusContext.Provider
        value={{
          dummyResult,
          backendExists,
          showNewBackendPage,
          newBackendVersion,
          recheckDummy,
          setNewBackend,
          setShowNewBackend,
          backendManifestVersion,
        }}
      >
        <osContext.Provider
          value={{ OS, isWindows, isMacOS, isManagedBackend, maximized, fullscreen }}
        >
          <FontContext>
            <AppFrame>
              <DynamicTitleBar />
              <AppRoot {...AppProps} />
            </AppFrame>
          </FontContext>
        </osContext.Provider>
      </backendStatusContext.Provider>
    </themeContext.Provider>
  );
}
