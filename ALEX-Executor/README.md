# ALEX Executor V1 — Windows and macOS

Cross-platform Electron/Luau editor with script open/save, dark-purple UI, and one-line installers. **This starter does NOT inject or execute scripts inside Roblox Player.** The Attach and Execute buttons are intentionally nonfunctional and display informative messages.

## GitHub staging

The project is stored in the `alex-executor-starter` branch of `annouli48-coder/alex-reuploader` in the `ALEX-Executor` folder. It is **not a standalone repository**. Existing code and Railway deployment on `main` were not changed.

## Install commands — only after the automatic prerelease succeeds

macOS (Intel and Apple Silicon):

```bash
curl -fsSL https://raw.githubusercontent.com/annouli48-coder/alex-reuploader/alex-executor-starter/ALEX-Executor/install/install-macos.sh | bash
```

Windows (PowerShell, x64):

```powershell
irm https://raw.githubusercontent.com/annouli48-coder/alex-reuploader/alex-executor-starter/ALEX-Executor/install/install-windows.ps1 | iex
```

**These commands are not usable until a GitHub Release tagged `alex-executor-v0.1.0` exists with files:**

- `ALEX-Executor-mac-arm64.zip` and `.sha256`
- `ALEX-Executor-mac-x64.zip` and `.sha256`
- `ALEX-Executor-Setup-x64.exe` and `.sha256`

Builds are defined in the repository-root `.github/workflows/alex-executor-build.yml` for the staging branch. **After all three builds pass**, the new publishing job verifies hashes and automatically creates a GitHub **prerelease** with the six required files. [Check the release here](https://github.com/annouli48-coder/alex-reuploader/releases/tag/alex-executor-v0.1.0) before running any installer. The workflow does not overwrite existing releases. Review remote scripts before running them; signing and notarization are recommended for distribution. These are unsigned editor builds and may be blocked by OS security protections.

## Download website and phone/tablet version

The `site/` folder contains the ALEX Code mobile PWA and desktop download hub. The website source is deployed by `.github/workflows/alex-executor-website.yml` to the intended URL `https://annouli48-coder.github.io/alex-reuploader/`.

**Publishing prerequisite:** GitHub Pages must be enabled in the repository's **Settings → Pages → Build and deployment → Source: GitHub Actions**. The automatic deploy can only succeed after that GitHub setting exists; having source files on a branch doesn't itself make the URL public. Check the Pages workflow run and the live URL before advertising the site.

The same mobile PWA works on iPhone/iPad Safari and supported Android browsers. iOS install: Safari Share → Add to Home Screen; Android: Chrome menu → Install app / Add to Home screen. Phones install this **web app**, not an IPA/APK, and they cannot execute scripts inside Roblox Player. The built-in editor saves in browser-local storage; use **Export** for backup. There is no backend or script upload. Desktop buttons enable only for verified assets and matching SHA-256 files in a real GitHub prerelease. Windows support targets x64; macOS targets Intel x64 and Apple Silicon arm64, not every historical OS.

## Custom icons and installer branding

- macOS Finder, Dock, and Launchpad use the purple **ALEX** tile embedded as `build/icon.icns`.
- Windows setup executable, Start menu, and desktop shortcut use `build/icon.ico`.
- Both one-command installers print an **ALEX EXECUTOR INSTALLER** ASCII-art banner and show download/verification/install messages.
- Source artwork is generated deterministically by `ALEX-Executor/scripts/generate_icons.py` (Pillow); the GitHub workflow generates it before compiling each platform. The artwork is original ALEX branding, not an Opiumware icon.
- The actual .app and .exe need a successful new GitHub Actions build. Previous build artifacts without icon support are not updated retroactively.

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

The GitHub Actions run must be completed successfully for download links to work. There is currently **no Roblox Player injection/execution engine**. The initial starter release is a desktop Luau file editor. The existing Reuploader repository `main` is untouched by this staging branch. New app versions require a new GitHub release tag plus the matching tag update in both installers and the workflow.
