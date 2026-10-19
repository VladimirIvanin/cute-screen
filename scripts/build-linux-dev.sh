#!/usr/bin/env bash
# Build a debug desktop with its own application identity and library.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
image=cute-screen-ubuntu22-build:local
cache="$root/artifacts/linux-dev"
mkdir -p "$cache"

docker build --file "$root/scripts/ubuntu22.Dockerfile" --tag "$image" "$root/scripts"
docker run --rm --init \
  --user "$(id -u):$(id -g)" \
  --env CARGO_HOME=/build/cargo \
  --env CARGO_BUILD_JOBS=4 \
  --env XDG_CACHE_HOME=/build/cache \
  --volume "$root:/source" \
  --volume "$cache:/build" \
  --volume "${CARGO_HOME:-$HOME/.cargo}:/build/cargo" \
  --workdir /source \
  "$image" pnpm tauri build --debug --no-bundle --config src-tauri/tauri.dev.conf.json -- --locked

# Atomic replacement also permits rebuilding while the previous dev app runs.
cp "$root/target/debug/cute-screen" "$cache/.cute-screen-dev.next"
mv "$cache/.cute-screen-dev.next" "$cache/cute-screen-dev"
