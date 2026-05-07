import { Dispatch, SetStateAction, createContext } from "react";

export const osContext = createContext<{
  OS: string;
  isWindows: boolean;
  isMacOS: boolean;
  // True when CSSLoader Desktop is responsible for managing the headless
  // backend lifecycle (install / start / kill). On Linux this is false because
  // the backend is shipped as a Decky plugin and managed by Decky Loader.
  isManagedBackend: boolean;
  maximized: boolean;
  fullscreen: boolean;
}>({
  OS: "",
  isWindows: false,
  isMacOS: false,
  isManagedBackend: false,
  maximized: false,
  fullscreen: false,
});
