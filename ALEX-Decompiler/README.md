# ALEX Decompiler — locked single-purpose desktop app

**Separate app:** This is **ALEX Decompiler**, not ALEX Executor. It has a separate aqua/violet icon and a single primary **Execute Decompiler** button. No Lua input box, arbitrary Lua execution, script preview or copy-script button is present.

## What Execute actually does

1. In **Roblox Studio**, open a place **you own or are authorized to edit**. Use **File → Save to File**, choosing **Roblox XML Place (`.rbxlx`)**. The `.rbxl` binary format is not supported by this app. An XML `.rbxmx` model is also accepted.
2. Open **ALEX Decompiler**, choose that saved file, and confirm you have permission to inspect it.
3. Click **Execute Decompiler**. The built-in offline engine inspects Roblox XML object hierarchy and extracts `Script`, `LocalScript`, and `ModuleScript` source **already present** in the file. It reports object and script counts. The engine runs on your computer; **it does not run the uploaded V4 Lua decompiler or run code inside Roblox**.
4. Click **Export extracted scripts + report**. The app saves a timestamped folder with source `.luau` files and `report.json`. Source that is not included in the place cannot be recovered. Saved files have collision-safe names and original instance paths documented in the report.

The uploaded `ALEX_DECOMPILER_ORIGINAL_V4_OPEN_HERE` code is an obfuscated `loadstring`-based script meant for a different execution environment. It has **not** been bundled or silently run in this app. Doing so would not provide access to a live Roblox Player game's protected server source. Running someone else's obfuscated Lua is unsafe without understanding its behavior.

## Script-protection limitations

There is no general-purpose script editor, execute-Lua textbox, copy button, or source display. The app's engine is shipped with the app and isn't exposed through its UI. **No distributed desktop app can guarantee its implementation is impossible to extract or reverse-engineer**, so do not market this as tamper-proof or uncopyable. You can retain full control of the engine only by keeping it on a server you operate, but that is unnecessary for this local authorized XML analyzer.

## Safety and access boundaries

- Does **not** inject into Roblox Player, attach to games, bypass anticheat, scrape protected experiences, or decompile Luau bytecode.
- Does not accept Lua snippets to execute; it parses XML as untrusted data. No network calls or hidden script execution.
- Does not make external requests; files stay on the computer. Source script filenames are sanitized. It needs a separate copy of the Studio project and does not change that original.
- The XML parser has a 120 MB input limit and a 2,000,000-character limit on each extracted script. It is a purpose-built parser for Roblox Studio XML, not a complete XML general-purpose engine; malformed or unsupported XML may fail.

## Development and builds

```sh
cd ALEX-Decompiler
npm install
npm test
npm start
```

Requires Node.js 22 and Electron for development. On GitHub runners, `scripts/generate_icon.py` generates `build/icon.icns` (macOS) and `build/icon.ico` (Windows) with Pillow, and the packaging workflow builds macOS Apple Silicon, macOS Intel, and Windows x64 prerelease packages with SHA-256 checksums.

Install the native macOS app after GitHub Actions has published `alex-decompiler-native-v1.0.0`:

```sh
curl -fsSL https://raw.githubusercontent.com/annouli48-coder/alex-reuploader/alex-executor-starter/ALEX-Decompiler/install/install-macos.sh | bash
```

The build is unsigned and not notarized; OS security checks may require review of the app developer. Do not bypass protections blindly. This is not affiliated with Roblox.

Official format docs: https://create.roblox.com/docs/projects/place-files


## Native app, not website

The macOS ZIP contains `ALEX Decompiler.app`, which runs in its own desktop window without Safari, a local web server, Roblox OAuth, or Railway. The Windows installer includes the same local analyzer. The separate ALEX Decompiler Connect browser service and its two-user Roblox OAuth vault are **not part of this offline app**. That online vault still requires hosting and Roblox OAuth to work.

**Windows PowerShell install:** `irm https://raw.githubusercontent.com/annouli48-coder/alex-reuploader/alex-executor-starter/ALEX-Decompiler/install/install-windows.ps1 | iex` (review the script first).
