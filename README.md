<p align="center">
    <img src="https://github.com/beebls/CSSLoader-Desktop/assets/52982404/172047f5-0682-4d1e-8e0d-3acb6ae958f6">
    <br><br>
    <h1 align="center">CSSLoader Desktop</h1>
    <h4 align="center">A native standalone styling engine for Steam on Windows, macOS, and Linux</h4>
    <p align="center">Inject custom styles into Steam's desktop and Big Picture Mode interfaces, browse an ever-growing storefront of community creations, easily manage your themes' settings and updates, and more.</p>
</p>

> **biscock fork — macOS support**
>
> This fork adds first-class macOS support (Apple Silicon + Intel) on top of the upstream Windows/Linux build. macOS releases live under [biscock/CSSLoader-Desktop releases](https://github.com/biscock/CSSLoader-Desktop/releases) and pull their backend from [biscock/SDH-CssLoader releases](https://github.com/biscock/SDH-CssLoader/releases). The Windows and Linux/Decky paths in this fork are identical to upstream.

<br><br>

# Features

## Theming

- Injects user generated CSS into any render target of Steam UI.
- Mix and match multiple themes to your liking.
- Supports "patches" for themes, allowing users to customize values using dropdowns, color pickers, and more.
- Allows custom images and fonts to be used. (See [Creating Symlink](#creating-symlink))
- "Profiles" allow you to save the state of multiple themes to reapply later.

## Theme Store

- An integrated storefront for you to download user-submitted themes.
- Prompts for updating your themes available in the 'Manage' tab.
- Account support to enable the starring of themes.

# Installation

## Downloading CSSLoader Desktop

### Windows

1. Download the latest CSSLoader Desktop `.msi` installer file from [Releases](https://github.com/beebls/CSSLoader-Desktop/releases/latest/).
2. Once downloaded, run the installer, and follow the onscreen instructions.
3. If this is your first time installing CSSLoader Desktop, upon launching the app you will be prompted to install CSSLoader's Backend. Click 'Install'
4. CSSLoader Desktop is now installed! Continue to [Creating Symlink](#creating-symlink) if you want to set up custom images/fonts.

### macOS

macOS bundles are unsigned. macOS will block first launch under Gatekeeper; the steps below show how to work around that with a single `xattr` command.

1. Download the matching zip from the latest [biscock/CSSLoader-Desktop release](https://github.com/biscock/CSSLoader-Desktop/releases/latest):
   - **Apple Silicon** (M1/M2/M3/M4): `CSSLoader-Desktop-arm64.zip`
   - **Intel**: `CSSLoader-Desktop-x86_64.zip`
2. Unzip and move `CSSLoader Desktop.app` into `/Applications/` (or `~/Applications/`).
3. Strip the Gatekeeper quarantine attribute so macOS lets the unsigned app run:
   ```
   xattr -dr com.apple.quarantine "/Applications/CSSLoader Desktop.app"
   ```
4. Open CSSLoader Desktop. The onboarding screen prompts you to install the standalone backend; click **Install Backend**. It pulls the matching zip from the latest [biscock/SDH-CssLoader release](https://github.com/biscock/SDH-CssLoader/releases) automatically.
5. Tell Steam to expose its CEF debugger so CSSLoader can inject styles. In the Steam Mac client: right-click **Steam** in your Library (or right-click the entry under Library → Software), open **Properties**, and set **Launch Options** to:
   ```
   -cef-enable-debugging %command%
   ```
   Restart Steam after saving.
6. Drop themes into `~/homebrew/themes/` (or use the in-app theme store) and click **Reload Themes**.

#### Menu-bar icon

The backend lives in the macOS menu bar (top-right of the screen, next to Wi-Fi/battery) as a paint-roller icon. Right-click for a quick menu — themes folder, Desktop app, quit. The Dock entry is intentionally hidden via `LSUIElement=true` in the bundle's `Info.plist`.

If you don't want the menu-bar icon at all, open CSSLoader Desktop → **Settings** → toggle **Show Menu Bar Icon** off. The backend bounces and continues running without it.

#### Updating

In CSSLoader Desktop, **Settings** → **Update Backend** re-fetches the newest backend from the biscock/SDH-CssLoader release and replaces `~/Library/Application Support/CssLoader/CssLoader-Standalone-Headless.app` in place. To update CSSLoader Desktop itself, download the new `.app` zip from biscock/CSSLoader-Desktop releases and re-do steps 1-3 above.

#### LaunchAgent (autostart on login)

Installing the backend writes `~/Library/LaunchAgents/com.deckthemes.cssloader.backend.plist` so the backend auto-starts on the next login via `launchd`. To disable: `launchctl unload ~/Library/LaunchAgents/com.deckthemes.cssloader.backend.plist` and delete the plist file.

### Linux/Steam Deck

#### Installing CSSLoader's Backend

1. [Install Decky Loader using the instructions on the Decky repository.](https://github.com/SteamDeckHomebrew/decky-loader#-installation)
2. Run Steam's Big Picture mode or open game mode on Steam Deck.
3. Open the Quick Access Menu. (QAM Button, Ctrl + 2, Xbox + A, or PS + X)
4. Select the Decky tab, it has the icon of a power plug.
5. Select the store icon in the top right.
6. Search for 'CSS Loader' and install it.
7. Leave the store, and select CSS Loader from the plugin menu.
8. Select 'Download Themes', then go to the 'Settings' tab in the Theme Store.
9. Enable the toggle for "Enable Standalone Backend"

#### Installing CSSLoader Desktop

1. Download the latest `.appimage` binary from [Releases](https://github.com/beebls/CSSLoader-Desktop/releases/latest/).
2. Running it will start CSSLoader Desktop.
3. Since CSSLoader Desktop cannot update the backend from the frontend, you will need to periodically open Steam Big Picture and update CSSLoader through Decky.

## Creating Symlink

In order to have custom images, fonts, and other files work in themes, you need to create a symlink.

If you are on Linux, you may skip this step as the symlink is created automatically.

### Windows

In order to create the symlink, you must run CSSLoader's Backend at least once with Windows Developer Mode enabled.

1. Open Settings (Win + I)
2. Select 'Privacy & Security'
   - On Windows 10, this is called 'Updates and Security'
3. Select 'For developers'
4. Toggle 'Developer Mode' on.
5. Restart CSSLoader's Backend.
   - You can do this by opening CSSLoader Desktop, clicking on the 'Settings' tab, and pressing 'Kill Backend', followed by 'Force Start Backend'
   - Alternatively, you can restart your system.
6. Click on your system tray, and right click on the white paint roller icon.
   - If you see the text "Custom Images/Fonts Enabled", you're set!
   - You may disable Developer Mode after going through this process.

# Building/Contribution

## Frontend

As a Tauri app, you will need all of [Tauri's prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites) to develop for CSSLoader Desktop.

To start a dev server, clone this repository, then run

```
npm i
npm run tauri dev
```

A maintained list of frontend bugs/upcoming features is available through our [project board](https://fyro.notion.site/31266833d05746b19d63a72c4a69b649), we refer to issues based on their IDs in the board.

## Store

The DeckThemes store is managed under [a different github repository](https://github.com/beebls/DeckThemes).

## Backend

CSSLoader's backend is managed under [a different github repository](https://github.com/suchmememanyskill/SDH-CSSLoader).

# Acknowledgements
