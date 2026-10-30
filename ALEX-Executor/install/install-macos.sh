#!/usr/bin/env bash
# ALEX Executor macOS installer. Requires a published GitHub Release.
set -euo pipefail
REPO="${ALEX_EXECUTOR_REPO:-annouli48-coder/alex-reuploader}"
TAG="${ALEX_EXECUTOR_RELEASE_TAG:-alex-executor-v0.1.0}"
case "$(uname -m)" in
  arm64) ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
  *) echo "Unsupported architecture" >&2; exit 2 ;;
esac
NAME="ALEX-Executor-mac-${ARCH}.zip"
BASE="https://github.com/${REPO}/releases/download/${TAG}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$BASE/$NAME" -o "$TMP/$NAME"
curl -fsSL "$BASE/$NAME.sha256" -o "$TMP/$NAME.sha256"
(cd "$TMP" && shasum -a 256 -c "$NAME.sha256")
mkdir -p "$TMP/unpacked"
ditto -xk "$TMP/$NAME" "$TMP/unpacked"
APP="$TMP/unpacked/ALEX Executor.app"
if [[ ! -d "$APP" ]]; then echo "App missing from release ZIP" >&2; exit 3; fi
mkdir -p "$HOME/Applications"
DEST="$HOME/Applications/ALEX Executor.app"
if [[ -e "$DEST" ]]; then rm -rf "$DEST"; fi
mv "$APP" "$DEST"
printf 'Installed: %s\n' "$DEST"
open "$DEST"
