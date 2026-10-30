#!/usr/bin/env bash
# ALEX Executor macOS installer. Requires a published GitHub Release.
set -euo pipefail
if [[ -t 1 ]]; then
  printf '\033[1;35m'
fi
cat <<'ALEX_LOGO'
      ___     __    ______  __  __
     /   |   / /   / ____/  \ \/ /
    / /| |  / /   / __/      \  /
   / ___ | / /___/ /___      /  \
  /_/  |_|/_____/_____/     /_/\_\

          ALEX EXECUTOR INSTALLER
ALEX_LOGO
if [[ -t 1 ]]; then printf '\033[0m'; fi
printf '[ALEX] Checking Mac architecture...\n'

REPO="${ALEX_EXECUTOR_REPO:-annouli48-coder/alex-reuploader}"
TAG="${ALEX_EXECUTOR_RELEASE_TAG:-alex-executor-v0.3.0}"
case "$(uname -m)" in
  arm64) ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
  *) echo "Unsupported architecture" >&2; exit 2 ;;
esac
NAME="ALEX-Executor-mac-${ARCH}.zip"
BASE="https://github.com/${REPO}/releases/download/${TAG}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
printf "[ALEX] Downloading %s...\n" "$NAME"
curl -fL --progress-bar "$BASE/$NAME" -o "$TMP/$NAME"
curl -fsSL "$BASE/$NAME.sha256" -o "$TMP/$NAME.sha256"
printf "[ALEX] Verifying SHA-256 checksum...\n"
(cd "$TMP" && shasum -a 256 -c "$NAME.sha256")
mkdir -p "$TMP/unpacked"
ditto -xk "$TMP/$NAME" "$TMP/unpacked"
APP="$TMP/unpacked/ALEX Executor.app"
if [[ ! -d "$APP" ]]; then echo "App missing from release ZIP" >&2; exit 3; fi
printf "[ALEX] Installing custom-icon app...\n"
mkdir -p "$HOME/Applications"
DEST="$HOME/Applications/ALEX Executor.app"
if [[ -e "$DEST" ]]; then rm -rf "$DEST"; fi
mv "$APP" "$DEST"
printf '[ALEX] Installed: %s\n' "$DEST"
printf '[ALEX] Launching ALEX Executor...\n'
open "$DEST"
