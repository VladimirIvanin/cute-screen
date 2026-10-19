#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
binary="$root/artifacts/linux-dev/cute-screen-dev"
if [[ ! -x "$binary" ]]; then
  echo 'Build the dev desktop first: pnpm build:linux:dev' >&2
  exit 1
fi
# The GUI identity is separate; isolate the Linux CLI activation socket too.
exec env XDG_SESSION_ID="${XDG_SESSION_ID:-desktop}-cute-screen-dev" CUTE_SCREEN_CAPTURE_DEBUG=1 "$binary" "$@"
