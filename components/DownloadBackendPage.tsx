import { useContext, useState } from "react";
import { downloadBackend } from "../backend/tauriMethods";
import { toast } from "../backend/toast";
import { GenericInstallBackendModal } from "./GenericInstallBackendModal";
import { osContext } from "@contexts/osContext";

export function DownloadBackendPage({
  onboarding = false,
  hideWindow,
  backendVersion,
  onUpdateFinish,
}: {
  onboarding?: boolean;
  hideWindow?: any;
  backendVersion?: string;
  onUpdateFinish?: any;
}) {
  const { isMacOS } = useContext(osContext);
  const [installProg, setInstallProg] = useState<number>(0);
  const [installText, setInstallText] = useState<string>("");
  async function installBackend() {
    setInstallProg(1);
    setInstallText("Downloading Backend");
    let ok = false;
    try {
      ok = await downloadBackend();
    } catch (err) {
      console.error("installBackend: downloadBackend threw", err);
      ok = false;
    }
    if (!ok) {
      // GenericInstallBackendModal only renders ``installText`` while
      // ``installProg > 0``, so we surface the failure as a toast and
      // re-enable the action button so the user can retry. The toast is
      // visible regardless of the modal's internal state.
      setInstallProg(0);
      setInstallText("");
      toast(
        "Backend install failed",
        "Check your internet connection and try again."
      );
      return;
    }
    setInstallProg(100);
    setInstallText("Install Complete");
    setTimeout(() => {
      onUpdateFinish();
    }, 1000);
  }

  // Onboarding copy is platform-specific because the OS-level setup looks
  // different on Windows vs. macOS.
  const onboardingDescription = isMacOS ? (
    <>
      <span>
        You must install CSSLoader's Backend to use CSSLoader Desktop. After install, Steam must
        be launched with the <code>-cef-enable-debugging</code> flag.
      </span>
      <br />
      <br />
      <span>
        The simplest way:{" "}
        <span
          className="cursor-pointer font-bold underline"
          onClick={async () => {
            const { open } = await import("@tauri-apps/api/shell");
            open("https://docs.deckthemes.com/CSSLoader/Install/#standalone");
          }}
        >
          right-click Steam in Library &rarr; Properties &rarr; Launch Options
        </span>{" "}
        and add <code>-cef-enable-debugging %command%</code>.
      </span>
    </>
  ) : (
    <>
      <span>
        You must install CSSLoader's Backend to use CSSLoader Desktop. If you wish to use custom
        images and fonts, you must{" "}
        <span
          className="cursor-pointer font-bold underline"
          onClick={async () => {
            const { open } = await import("@tauri-apps/api/shell");
            open("https://docs.deckthemes.com/CSSLoader/Install/#standalone");
          }}
        >
          enable Windows Developer Mode.
        </span>
      </span>
    </>
  );

  return (
    <>
      <GenericInstallBackendModal
        titleText={onboarding ? "Install CSSLoader's Backend" : "Backend Update Available"}
        dontClose={installProg > 0 || onboarding}
        descriptionText={
          onboarding
            ? onboardingDescription
            : "We recommend installing backend updates as soon as they're available in order to maintain compatibility with new themes."
        }
        {...{ installProg, installText }}
        onAction={() => installBackend()}
        onCloseWindow={() => hideWindow()}
      />
    </>
  );
}
