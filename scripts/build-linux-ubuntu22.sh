#!/usr/bin/env bash
# Native x64/ARM64 build; source and host target/node_modules stay untouched.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
image=cute-screen-ubuntu22-build:local
work="$root/artifacts/ubuntu22-work"
output="$root/artifacts/ubuntu22"
mkdir -p "$work" "$output"

docker build --file "$root/scripts/ubuntu22.Dockerfile" --tag "$image" "$root/scripts"
docker run --rm --init \
  --user "$(id -u):$(id -g)" \
  --env HOME=/build/.home \
  --env CARGO_HOME=/build/.cargo \
  --env CARGO_BUILD_JOBS=2 \
  --env APPIMAGE_EXTRACT_AND_RUN=1 \
  --volume "$root:/source:ro" \
  --volume "$work:/build" \
  --volume "$output:/output" \
  "$image" bash /source/scripts/build-linux-ubuntu22-container.sh
