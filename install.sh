#!/usr/bin/env bash
# dgtui installer: downloads the latest release binary from GitHub.
# Usage: curl -fsSL https://raw.githubusercontent.com/<owner>/dgtui/main/install.sh | bash

set -euo pipefail

REPO="${DGTUI_REPO:-mjimeneznet/dgtui}"   # repo owner/name
DEST="${DGTUI_DEST:-$HOME/.local/bin}"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) target="darwin-arm64" ;;
  Darwin-x86_64) target="darwin-x64" ;;
  Linux-x86_64) target="linux-x64" ;;
  Linux-aarch64) target="linux-arm64" ;;
  *) echo "Unsupported platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

# Latest published release (non-draft, non-prerelease)
tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p')"
[ -n "$tag" ] || { echo "Could not resolve latest release" >&2; exit 1; }

url="https://github.com/${REPO}/releases/download/${tag}/dgtui-${target}.tar.gz"
echo "Installing dgtui ${tag} (${target})..."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$url" -o "$tmp/dgtui.tar.gz"
tar -xzf "$tmp/dgtui.tar.gz" -C "$tmp"

mkdir -p "$DEST"
install -m 755 "$tmp/dgtui-${target}" "$DEST/dgtui"

echo "Installed to $DEST/dgtui"
if ! command -v dgtui >/dev/null 2>&1; then
  case ":$PATH:" in
    *":$DEST:"*) ;;
    *) echo "NOTE: $DEST is not in your PATH. Add: export PATH=\"$DEST:\$PATH\"" ;;
  esac
fi
