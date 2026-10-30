# ALEX Executor V2 (v0.2.0) — Windows and macOS

Cross-platform Electron/Luau editor with script open/save, dark-purple UI, and one-line installers. **This starter does NOT inject or execute scripts inside Roblox Player.** The Attach and Execute buttons are intentionally nonfunctional and display informative messages.

## GitHub staging

The project is stored in the `alex-executor-starter` branch of `annouli48-coder/alex-reuploader` in the `ALEX-Executor` folder. It is **not a standalone repository**. Existing code and Railway deployment on `main` were not changed.

## Install commands — v0.2.0 prerelease published

macOS (Intel and Apple Silicon):

```bash
curl -fsSL https://raw.githubusercontent.com/annouli48-coder/alex-reuploader/alex-executor-starter/ALEX-Executor/install/install-macos.sh | bash
```

Windows (PowerShell, x64):

```powershell
irm https://raw.githubusercontent.com/annouli48-coder/alex-reuploader/alex-executor-starter/ALEX-Executor/install/install-windows.ps1 | iex
```

**Verified release status (October 30, 2026):** The `alex-executor-v0.2.0` prerelease was published successfully, with all six downloadable assets:

- `ALEX-Executor-mac-arm64.zip` and `.sha256`
- `ALEX-Executor-mac-x64.zip` and `.sha256`
- `ALEX-Executor-Setup-x64.exe` and `.sha256`

Builds are defined in the repository-root `.github/workflows/alex-executor-build.yml` for the staging branch. The [v0.2.0 build workflow completed successfully](https://github.com/annouli48-coder/alex-reuploader/actions/runs/41126268585), published the [v0.2.0 prerelease](https://github.com/annouli48-coder/alex-reuploader/releases/tag/alex-executor-v0.2.0), and uploaded three platform packages plus matching SHA-256 files. The macOS script detects Intel versus Apple Silicon and verifies its downloaded ZIP before installing in `~/Applications`. The Windows script verifies its setup executable before running it. Review remote scripts before running them; signing and notarization are recommended for wider distribution. These are unsigned editor builds and may be blocked by OS security protections. Actual install and launch on users' machines have not been independently verified.

## Download website and phone/tablet version

The `site/` folder contains the ALEX Code mobile PWA and desktop download hub. The website source is deployed by `.github/workflows/alex-executor-website.yml` to the intended URL `https://annouli48-coder.github.io/alex-reuploader/`.

**Publishing prerequisite (still required):** The [website build succeeded but Pages deployment failed](https://github.com/annouli48-coder/alex-reuploader/actions/runs/41126119901) because Pages is not enabled. The repository owner must open [Settings → Pages](https://github.com/annouli48-coder/alex-reuploader/settings/pages) and select **Build and deployment → Source: GitHub Actions**. Then open [the failed website workflow run](https://github.com/annouli48-coder/alex-reuploader/actions/runs/41126119901) and use **Re-run jobs → Re-run failed jobs**. The site target is `https://annouli48-coder.github.io/alex-reuploader/`; verify it loads before sharing the URL. GitHub's default `GITHUB_TOKEN` cannot enable Pages automatically in this repository. Until that setting is changed, the site is not confirmed live.

The same mobile PWA works on iPhone/iPad Safari and supported Android browsers. iOS install: Safari Share → Add to Home Screen; Android: Chrome menu → Install app / Add to Home screen. Phones install this **web app**, not an IPA/APK, and they cannot execute scripts inside Roblox Player. The built-in editor saves in browser-local storage; use **Export** for backup. There is no backend or script upload. Desktop buttons enable only for verified assets and matching SHA-256 files in a real GitHub prerelease. Windows support targets x64; macOS targets Intel x64 and Apple Silicon arm64, not every historical OS.

## Custom icons and installer branding

- macOS Finder, Dock, and Launchpad use the purple **ALEX** tile embedded as `build/icon.icns`.
- Windows setup executable, Start menu, and desktop shortcut use `build/icon.ico`.
- Both one-command installers print an **ALEX EXECUTOR INSTALLER** ASCII-art banner and show download/verification/install messages.
- Source artwork is generated deterministically by `ALEX-Executor/scripts/generate_icons.py` (Pillow); the GitHub workflow generates it before compiling each platform. The artwork is original ALEX branding, not an Opiumware icon.
- The v0.2.0 macOS `.app` archives and Windows `.exe` were produced by the successful release workflow with the branded icon-generation step; their appearance after local installation still needs a real-device check.

## Local development

```bash
cd ALEX-Executor
npm install
python3 -m pip install Pillow==11.3.0
python3 scripts/generate_icons.py
npm start
```

Requires Node.js 22 or newer. App can open/edit/save `.lua` and `.luau` files. Roblox Player script injection is **not** implemented. No source obfuscation, process injection or anti-cheat bypass is included. GitHub Actions compilation and live installs have not yet been verified.

## Important release notes

The **v0.2.0 desktop prerelease is published**; download links are available now. GitHub Pages publication remains blocked on the repository's initial Pages setting. There is currently **no Roblox Player injection/execution engine**. The starter release is a desktop Luau file editor. The existing Reuploader repository `main` is untouched by this staging branch. New app versions require a new GitHub release tag plus the matching tag update in both installers and the workflow.

## ALEX V2 interface updates

The desktop Electron app now includes multiple code tabs, session restore, custom accent themes, editor backgrounds, adjustable code font size, and optional line wrapping. Mac and Windows installer scripts target the **v0.2.0** release. The mobile ALEX Code PWA uses a floating A icon to open a draggable/resizable editor inside the PWA (not inside other apps). It includes matching saved color/background/font controls, and source import/export. The Roblox in-game Test Lab (separate from the PWA) now has a floating ALEX launcher and movable/resizable panel with settings in **your own private test experience**. Desktop Attach/Execute buttons are not connected to Roblox Player, and the PWA cannot inject into Roblox.
