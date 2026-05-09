import { AlertDialog, LabelledInput, ToggleSwitch, Tooltip } from "@components/Primitives";
import { killBackend, startBackend, storeRead, storeWrite, toast } from "backend";
import { useState, useEffect, useContext } from "react";
import { AiOutlineQuestionCircle } from "react-icons/ai";
import { BsDiscord } from "react-icons/bs";
import { FaPatreon } from "react-icons/fa";
import { themeContext } from "@contexts/themeContext";
import { osContext } from "@contexts/osContext";
import { ImSpinner5 } from "react-icons/im";
import { CreateTemplateTheme } from "@components/Settings";
import { fetch, Body } from "@tauri-apps/api/http";
import { invoke } from "@tauri-apps/api";

export default function SettingsPage() {
  const [token, setToken] = useState<string>("");
  const [betaTranslationsState, setBetaTranslationsState] = useState<boolean>(false);

  async function fetchToken() {
    const res = await storeRead("shortToken");
    if (res.success && res.result) {
      setToken(res.result);
    }
  }

  async function fetchBetaTranslationsState() {
    const res = await storeRead("beta_translations");
    if (res.success && res.result) {
      setBetaTranslationsState(res.result === "1" ? true : false);
    }
  }

  async function updateBetaTranslations(value: boolean) {
    setOngoingAction(true);
    const res = await storeWrite("beta_translations", value ? "1" : "0");
    setOngoingAction(false);
    if (!res.success) {
      toast("Error Updating Beta Translations State");
      return;
    }
    toast("Changes will apply after a restart.");
    void fetchBetaTranslationsState();
  }

  useEffect(() => {
    void fetchToken();
    void fetchBetaTranslationsState();
  }, []);

  const { refreshThemes } = useContext(themeContext);
  const { isMacOS, isManagedBackend } = useContext(osContext);

  const [ongoingAction, setOngoingAction] = useState<boolean>(false);
  const [trayDisabled, setTrayDisabled] = useState<boolean>(false);

  // "Run at startup" toggle. The Rust backend exposes:
  //   * is_desktop_autostart_supported() -> boolean
  //   * is_desktop_autostart_enabled()   -> boolean
  //   * set_desktop_autostart(enabled)   -> void | Error
  // The "supported" flag gates whether we render the toggle at all (false on
  // Linux), and "enabled" populates the toggle's initial state.
  const [autostartSupported, setAutostartSupported] = useState<boolean>(false);
  const [autostartEnabled, setAutostartEnabled] = useState<boolean>(false);

  async function fetchAutostartState() {
    try {
      const supported = await invoke<boolean>("is_desktop_autostart_supported");
      setAutostartSupported(supported);
      if (supported) {
        const enabled = await invoke<boolean>("is_desktop_autostart_enabled");
        setAutostartEnabled(enabled);
      }
    } catch (e) {
      console.error("Failed to read autostart state:", e);
    }
  }

  async function updateAutostart(value: boolean) {
    setOngoingAction(true);
    try {
      await invoke("set_desktop_autostart", { enabled: value });
      setAutostartEnabled(value);
      toast(value ? "Run at startup enabled" : "Run at startup disabled");
    } catch (e) {
      console.error(e);
      toast("Error Updating Run at Startup", String(e));
    } finally {
      setOngoingAction(false);
    }
  }

  useEffect(() => {
    void fetchAutostartState();
  }, []);

  // Tray icon toggle: only applies when the Desktop app is the one starting
  // the headless backend (Windows/macOS), and only macOS exposes the tray icon
  // today. The setting is read by the Python backend from its config store on
  // startup and on SIGHUP, so we restart it after a change.
  async function fetchTrayDisabled() {
    const res = await storeRead("disable_tray");
    if (res.success) setTrayDisabled(res.result === "1");
  }
  async function updateTrayDisabled(value: boolean) {
    setOngoingAction(true);
    const res = await storeWrite("disable_tray", value ? "1" : "0");
    if (res.success) {
      // Bounce the backend so the new value takes effect immediately.
      await killBackend().catch(() => {});
      await startBackend().catch(() => {});
      setTrayDisabled(value);
      toast(value ? "Tray icon disabled" : "Tray icon enabled");
    } else {
      toast("Error Updating Tray Setting");
    }
    setOngoingAction(false);
  }
  useEffect(() => {
    if (isManagedBackend) void fetchTrayDisabled();
  }, [isManagedBackend]);

  // const [showBackendInstallModal, setShowBackendInstallModal] = useState<boolean>(false);
  // const [installText, setInstallText] = useState<string>("");
  // const [installModalDesc, setInstallModalDesc] = useState<string>("");

  function onSaveToken() {
    if (token.length !== 12) {
      toast("Invalid Token Length");
      return;
    }
    setOngoingAction(true);
    fetch("https://api.deckthemes.com/auth/authenticate_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: Body.json({ token: token }),
    })
      .then((res) => {
        if (res.ok) {
          storeWrite("shortToken", token).then(() => {});
          toast("Token Saved");
          setOngoingAction(false);
        } else {
          throw new Error("Invalid Token");
        }
      })
      .catch(() => {
        toast("Error Validating Token");
        setOngoingAction(false);
      });
  }

  return (
    <>
      <main className="flex w-full flex-1 flex-grow flex-col items-center gap-4 px-4">
        <div className="mt-6 flex w-full max-w-[960px] flex-col gap-8">
          <div className="flex w-full flex-col gap-4">
            <span className="text-lg font-bold">Store Settings</span>
            <div className="flex items-end justify-center gap-4">
              <LabelledInput
                password
                label={
                  <div className="flex items-center gap-2">
                    <span>DeckThemes Token</span>
                    <Tooltip
                      triggerContent={<AiOutlineQuestionCircle size={18} />}
                      content={
                        <span className="text-sm">
                          A token enables you to star themes in the store.
                          <br />
                          You can create a token through your account page on{" "}
                          <span
                            className="cursor-pointer text-fore-9-dark"
                            onClick={async () => {
                              const { open } = await import("@tauri-apps/api/shell");
                              open("https://deckthemes.com");
                            }}
                          >
                            deckthemes.com
                          </span>
                        </span>
                      }
                    />
                  </div>
                }
                value={token}
                onValueChange={setToken}
              />
              <button
                disabled={ongoingAction}
                onClick={onSaveToken}
                className="h-12 whitespace-nowrap rounded-xl bg-brandBlue px-4"
              >
                {ongoingAction ? <ImSpinner5 /> : "Save Token"}
              </button>
            </div>
          </div>
          <div className="flex w-full flex-col gap-4">
            <span className="text-lg font-bold">CSSLoader Settings</span>
            <div className="flex w-full items-center justify-center rounded-xl border-2 border-borders-base1-dark p-6 transition hover:border-borders-base2-dark dark:bg-base-3-dark">
              <div className="flex flex-col">
                <span className="text-md font-bold">Enable Beta Steam CSS Translations</span>
                <span className="text-sm">Enable this if you are on Steam Client Beta</span>
              </div>
              <div className="ml-auto flex items-center">
                <ToggleSwitch
                  checked={betaTranslationsState}
                  disabled={ongoingAction}
                  onChange={updateBetaTranslations}
                />
              </div>
            </div>
          </div>
          {autostartSupported && (
            <div className="flex w-full flex-col gap-4">
              <span className="text-lg font-bold">Startup</span>
              <div className="flex w-full items-center justify-center rounded-xl border-2 border-borders-base1-dark p-6 transition hover:border-borders-base2-dark dark:bg-base-3-dark">
                <div className="flex flex-col">
                  <span className="text-md font-bold">Run at Startup</span>
                  <span className="text-sm">
                    Automatically launch CSSLoader Desktop when you log in. The window stays
                    hidden in the background — open it from the CSSLoader icon next to the
                    system clock.
                  </span>
                </div>
                <div className="ml-auto flex items-center">
                  <ToggleSwitch
                    checked={autostartEnabled}
                    disabled={ongoingAction}
                    onChange={updateAutostart}
                  />
                </div>
              </div>
            </div>
          )}
          {isMacOS && (
            <div className="flex w-full flex-col gap-4">
              <span className="text-lg font-bold">macOS</span>
              <div className="flex w-full items-center justify-center rounded-xl border-2 border-borders-base1-dark p-6 transition hover:border-borders-base2-dark dark:bg-base-3-dark">
                <div className="flex flex-col">
                  <span className="text-md font-bold">Show Menu Bar Icon</span>
                  <span className="text-sm">
                    The headless backend shows a small CSSLoader icon next to the system clock.
                    Toggling this restarts the backend.
                  </span>
                </div>
                <div className="ml-auto flex items-center">
                  <ToggleSwitch
                    checked={!trayDisabled}
                    disabled={ongoingAction}
                    onChange={(value) => updateTrayDisabled(!value)}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="flex w-full flex-col gap-4">
            <span className="text-lg font-bold">Developer Settings</span>
            <CreateTemplateTheme {...{ ongoingAction }} />
            {isManagedBackend && (
              <>
                <button
                  disabled={ongoingAction}
                  onClick={async () => {
                    setOngoingAction(true);
                    await killBackend();
                    setOngoingAction(false);
                    console.log("Backend Killed");
                  }}
                  className="flex h-12 items-center justify-center whitespace-nowrap rounded-xl bg-base-3-dark px-4 focus-visible:ring-4 focus-visible:ring-amber9"
                >
                  {ongoingAction ? <ImSpinner5 /> : "Kill Backend"}
                </button>
                <button
                  disabled={ongoingAction}
                  onClick={async () => {
                    setOngoingAction(true);
                    await startBackend();
                    setOngoingAction(false);
                    console.log("Backend Started");
                  }}
                  className="flex h-12 items-center justify-center whitespace-nowrap rounded-xl bg-base-3-dark px-4 focus-visible:ring-4 focus-visible:ring-amber9"
                >
                  {ongoingAction ? <ImSpinner5 /> : "Force Start Backend"}
                </button>
                <button
                  disabled={ongoingAction}
                  onClick={async () => {
                    // These have to be async imported here as otherwise NextJS tries to "SSR" them and it errors
                    const { invoke } = await import("@tauri-apps/api");
                    const { open } = await import("@tauri-apps/api/shell");
                    const path: string = await invoke("get_string_startup_dir", {});
                    open(path);
                  }}
                  className="flex h-12 items-center justify-center whitespace-nowrap rounded-xl bg-base-3-dark px-4 focus-visible:ring-4 focus-visible:ring-amber9"
                >
                  Open Backend Location
                </button>
              </>
            )}
          </div>
          <div className="flex w-full flex-col gap-4">
            <span className="text-lg font-bold">Credits</span>
            <ul>
              <li>SuchMemeManySkill - Backend Dev</li>
              <li>Beebles - Frontend Dev</li>
              <li>Fero - Frontend Dev</li>
              <li>Emerald - Frontend Dev</li>
            </ul>
            <div className="flex w-full flex-col items-start pb-8">
              <button
                className="flex items-center justify-center gap-4 text-discordColor"
                onClick={async () => {
                  const { open } = await import("@tauri-apps/api/shell");
                  await open("https://deckthemes.com/discord");
                }}
              >
                <BsDiscord />
                <span>Join The Community</span>
              </button>
              <button
                className="flex items-center justify-center gap-4 text-patreonColor"
                onClick={async () => {
                  const { open } = await import("@tauri-apps/api/shell");
                  await open("https://patreon.com/deckthemes");
                }}
              >
                <FaPatreon />
                <span>Support Us</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
