# ALEX Executor V1 — Windows and macOS

Cross-platform Electron/Luau editor with script open/save, dark-purple UI, and one-line installers. **This starter does NOT inject or execute scripts inside Roblox Player.** The Attach and Execute buttons are intentionally nonfunctional and display informative messages.

## GitHub staging

The project is stored in the `alex-executor-starter` branch of `annouli48-coder/alex-reuploader` in the `ALEX-Executor` folder. It is **not a standalone repository**. Existing code and Railway deployment on `main` were not changed.

## Install commands — only once a release is published

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

Builds are defined in `.github/workflows/alex-executor-build.yml` for the staging branch. Build artifacts must be verified and uploaded to that tagged Release. Review scripts before running remote install commands. Signing and notarization are recommended for public distribution.

## Local development

```bash
cd ALEX-Executor
npm install
npm start
```

Requires Node.js 22 or newer. App can open/edit/save `.lua` and `.luau` files. Roblox Player script injection is **not** implemented. No source obfuscation, process injection or anti-cheat bypass is included. GitHub Actions compilation and live installs have not yet been verified.
