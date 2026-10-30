# ALEX Roblox Workspace V3 (v0.3.0) — Windows and macOS

Roblox-only Electron/Luau desktop workspace with a redesigned editor, Roblox templates, script import/save, copy-to-Studio Test Lab workflow, official Roblox update links, and one-line installers. **This app does NOT inject or execute scripts inside Roblox Player.** The old Attach button has been removed and replaced by a real clipboard and Roblox Studio testing workflow.

## GitHub staging

The project is stored in the `alex-executor-starter` branch of `annouli48-coder/alex-reuploader` in the `ALEX-Executor` folder. It is **not a standalone repository**. Existing code and Railway deployment on `main` were not changed.

## Install commands — v0.3.0 prerelease (after successful build)

macOS (Intel and Apple Silicon):

```bash
curl -fsSL https://raw.githubusercontent.com/annouli48-coder/alex-reuploader/alex-executor-starter/ALEX-Executor/install/install-macos.sh | bash
```

Windows (PowerShell, x64):

```powershell
irm https://raw.githubusercontent.com/annouli48-coder/alex-reuploader/alex-executor-starter/ALEX-Executor/install/install-windows.ps1 | iex
```

**New release target:** `alex-executor-v0.3.0` needs a successful build before installation. The already-published v0.2.0 remains available separately. The v0.3.0 release should contain these six downloadable assets:

- `ALEX-Executor-mac-arm64.zip` and `.sha256`
- `ALEX-Executor-mac-x64.zip` and `.sha256`
- `ALEX-Executor-Setup-x64.exe` and `.sha256`

Builds are defined in the repository-root `.github/workflows/alex-executor-build.yml` for the staging branch. The [desktop workflow](https://github.com/annouli48-coder/alex-reuploader/actions/workflows/alex-executor-build.yml) checks syntax and V3 smoke tests, builds Windows plus both Mac architectures, validates all checksums, and will publish the [v0.3.0 prerelease](https://github.com/annouli48-coder/alex-reuploader/releases/tag/alex-executor-v0.3.0) if successful. The macOS script detects Intel versus Apple Silicon and verifies its downloaded ZIP before installing in `~/Applications`. The Windows script verifies its setup executable before running it. Review remote scripts before running them; signing and notarization are recommended for wider distribution. These are unsigned editor builds and may be blocked by OS security protections. Actual install and launch on users' machines have not been independently verified.

## Download website and phone/tablet version

The `site/` folder contains the ALEX Code mobile PWA and desktop download hub. The website source is deployed by `.github/workflows/alex-executor-website.yml` to the intended URL `https://annouli48-coder.github.io/alex-reuploader/`.

**Publishing prerequisite (still required):** The [website build succeeded but Pages deployment failed](https://github.com/annouli48-coder/alex-reuploader/actions/runs/41126119901) because Pages is not enabled. The repository owner must open [Settings → Pages](https://github.com/annouli48-coder/alex-reuploader/settings/pages) and select **Build and deployment → Source: GitHub Actions**. Then open [the failed website workflow run](https://github.com/annouli48-coder/alex-reuploader/actions/runs/41126119901) and use **Re-run jobs → Re-run failed jobs**. The site target is `https://annouli48-coder.github.io/alex-reuploader/`; verify it loads before sharing the URL. GitHub's default `GITHUB_TOKEN` cannot enable Pages automatically in this repository. Until that setting is changed, the site is not confirmed live.

The same mobile PWA works on iPhone/iPad Safari and supported Android browsers. iOS install: Safari Share → Add to Home Screen; Android: Chrome menu → Install app / Add to Home screen. Phones install this **web app**, not an IPA/APK, and they cannot execute scripts inside Roblox Player. The built-in editor saves in browser-local storage; use **Export** for backup. There is no backend or script upload. Desktop buttons enable only for verified assets and matching SHA-256 files in a real GitHub prerelease. Windows support targets x64; macOS targets Intel x64 and Apple Silicon arm64, not every historical OS.

## Custom icons and installer branding

- macOS Finder, Dock, and Launchpad use the purple **ALEX** tile embedded as `build/icon.icns`.
- Windows setup executable, Start menu, and desktop shortcut use `build/icon.ico`.
- Both one-command installers print an **ALEX EXECUTOR INSTALLER** ASCII-art banner and show download/verification/install messages.
- Source artwork is generated deterministically by `ALEX-Executor/scripts/generate_icons.py` (Pillow); the GitHub workflow generates it before compiling each platform. The artwork is original ALEX branding, not an Opiumware icon.
- The V3 macOS `.app` archives and Windows `.exe` will be produced by the new release workflow with the existing branded icon-generation step. Installation and appearance still require real-device verification.

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

The **v0.3.0 desktop prerelease is targeted by the updated build workflow**; verify the release assets exist before running installers. GitHub Pages publication remains blocked on the repository's initial Pages setting. There is **no Roblox Player injection/execution engine**. The release is a desktop Luau editor with an owned-place Studio test workflow. The existing Reuploader repository `main` is untouched by this staging branch. New app versions require a new GitHub release tag plus the matching tag update in both installers and the workflow.

## ALEX V3 Roblox-only interface

V3 redesigns the desktop with a polished dark workspace, sidebar navigation, prominent script tabs, Roblox Luau branding, a compact activity log, an official Roblox update panel, and four creator templates (Player, TweenService, RemoteEvent and ScreenGui). It preserves multi-tab session restore, font/theme/background customization and line wrapping. The native open/save dialogs support Lua, Luau and plain-text source; the maximum file size is 8 MB so large exported Luau scripts can be opened. The Copy and Test in Studio actions copy the active script to the native clipboard and show step-by-step directions for testing in **an experience you own**. This does **not** directly execute code in Roblox or inject into the player. The new smoke check validates UI IDs and bridge wiring, and the native app uses an allowlist for external Roblox documentation links.

The Mac and Windows installers and website release checker target **v0.3.0**. The independent mobile ALEX Code PWA and in-game private Test Lab are unchanged, and cannot inject into Roblox Player. The app includes a dated October 30, 2026 Roblox release-notes snapshot; use the external official links for future updates.
