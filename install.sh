#!/usr/bin/env bash
# dgtui installer: downloads the latest release binary from GitHub.
# Usage: curl -fsSL https://raw.githubusercontent.com/<owner>/dgtui/main/install.sh | bash

set -euo pipefail

REPO="${DGTUI_REPO:-mjimeneznet/dgtui}"   # repo owner/name
DEST="${DGTUI_DEST:-$HOME/.local/bin}"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

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

# Releases published before checksums existed have no SHA256SUMS: verify when
# present, warn when absent, never install silently on a mismatch.
sums_url="https://github.com/${REPO}/releases/download/${tag}/SHA256SUMS"
if curl -fsSL "$sums_url" -o "$tmp/SHA256SUMS" 2>/dev/null; then
  cp "$tmp/dgtui.tar.gz" "$tmp/dgtui-${target}.tar.gz"
  if grep -F " dgtui-${target}.tar.gz" "$tmp/SHA256SUMS" > "$tmp/expected"; then
    ( cd "$tmp" && sha256 -c expected >/dev/null ) \
      || { echo "Checksum mismatch for dgtui-${target}.tar.gz" >&2; exit 1; }
    echo "Checksum verified."
  else
    echo "NOTE: ${tag} publishes SHA256SUMS without an entry for ${target}; skipping verification" >&2
  fi
else
  echo "NOTE: ${tag} publishes no SHA256SUMS; skipping verification" >&2
fi

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
