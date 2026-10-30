#!/usr/bin/env bash
# Installs the single-purpose ALEX Decompiler app from the verified GitHub prerelease.
set -euo pipefail
TAG="${ALEX_DECOMPILER_TAG:-alex-decompiler-native-v1.0.0}"
REPO="${ALEX_DECOMPILER_REPO:-annouli48-coder/alex-reuploader}"
case "$(uname -m)" in arm64) ARCH=arm64;; x86_64) ARCH=x64;; *) echo 'Unsupported Mac CPU' >&2; exit 1;; esac
ASSET="ALEX-Decompiler-mac-${ARCH}.zip"
BASE="https://github.com/${REPO}/releases/download/${TAG}"
TEMP="$(mktemp -d)";trap 'rm -rf "$TEMP"' EXIT
printf '\033[1;36m[ALEX DECOMPILER] Downloading %s\033[0m\n' "$ASSET"
curl -fL --progress-bar "$BASE/$ASSET" -o "$TEMP/$ASSET"
curl -fsSL "$BASE/$ASSET.sha256" -o "$TEMP/$ASSET.sha256"
(cd "$TEMP" && shasum -a 256 -c "$ASSET.sha256")
mkdir -p "$TEMP/unpacked"
ditto -xk "$TEMP/$ASSET" "$TEMP/unpacked"
APP="$TEMP/unpacked/ALEX Decompiler.app"
test -d "$APP" || { echo 'Application missing inside archive' >&2; exit 1; }
mkdir -p "$HOME/Applications"
DEST="$HOME/Applications/ALEX Decompiler.app"
if [[ -e "$DEST" ]]; then mv "$DEST" "$HOME/Applications/ALEX Decompiler.backup.$(date +%s).app"; fi
mv "$APP" "$DEST"
printf '[ALEX DECOMPILER] Installed to %s\n' "$DEST"
open "$DEST"
