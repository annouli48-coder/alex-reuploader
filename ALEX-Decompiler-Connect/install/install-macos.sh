#!/usr/bin/env bash
# ALEX Decompiler Connect: installs an app-style launcher for the hosted website.
# It does NOT download or execute Roblox Lua code.
set -euo pipefail
URL="${1:-${ALEX_SITE_URL:-}}"
if [[ ! "$URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9_./-]*)?$ ]]; then
  echo 'Usage: bash install-macos.sh https://your-real-deployed-ALEX-site.example' >&2
  echo 'The server must be deployed and Roblox OAuth configured before installation.' >&2
  exit 2
fi
HERE="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/Applications/ALEX Decompiler Connect.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>alex-launcher</string>
<key>CFBundleIdentifier</key><string>com.alex.decompiler.connect</string>
<key>CFBundleName</key><string>ALEX Decompiler Connect</string>
<key>CFBundleDisplayName</key><string>ALEX Decompiler Connect</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleIconFile</key><string>icon.icns</string>
</dict></plist>
PLIST
{
  echo '#!/bin/bash'
  printf 'exec /usr/bin/open %q\n' "$URL"
} > "$APP/Contents/MacOS/alex-launcher"
chmod +x "$APP/Contents/MacOS/alex-launcher"
if [[ -f "$HERE/desktop/assets/icon.icns" ]]; then
  cp "$HERE/desktop/assets/icon.icns" "$APP/Contents/Resources/icon.icns"
fi
printf 'Installed ALEX Decompiler Connect launcher: %s\n' "$APP"
echo 'This launcher opens the hosted ALEX website in your default browser.'
open "$APP"
