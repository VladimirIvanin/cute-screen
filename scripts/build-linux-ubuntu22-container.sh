#!/usr/bin/env bash
set -euo pipefail

source /etc/os-release
if [[ "$ID" != ubuntu || "$VERSION_ID" != 22.04 ]]; then
  echo "This packaging entry point requires Ubuntu 22.04." >&2
  exit 1
fi

# Do not reuse native dependencies or Cargo output from a newer distribution.
rsync -a --no-owner --no-group --delete \
  --exclude '/.git' --exclude 'node_modules' --exclude 'target' --exclude 'dist' \
  --exclude '*.tsbuildinfo' --exclude '/artifacts' --exclude '/.cargo' --exclude '/.home' \
  /source/ /build/
mkdir -p "$HOME"
pnpm install --frozen-lockfile --store-dir /build/.home/pnpm-store
rm -rf target/release/bundle/deb target/release/bundle/appimage
pnpm tauri build --bundles deb,appimage -- --locked
bash scripts/check-linux-compat.sh
target/release/cute-screen --help
node scripts/check-m04-deb.mjs
node scripts/check-m04-appimage.mjs

# Publish only after all packaging gates pass.
cp target/release/bundle/deb/*.deb target/release/bundle/appimage/*.AppImage /output/
(
  cd /output
  sha256sum ./*.deb ./*.AppImage > SHA256SUMS
)
