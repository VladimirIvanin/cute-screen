#!/usr/bin/env bash
# Check the actual ELF version requirements, including weak imports.
set -euo pipefail
export LC_ALL=C

binary="${1:-target/release/cute-screen}"
baseline=2.35
versions=$(readelf --version-info --wide "$binary" |
  awk '{ for (i = 1; i < NF; i++) if ($i == "Name:" && $(i + 1) ~ /^GLIBC_/) print substr($(i + 1), 7) }' |
  sort -Vu)

if [[ -z "$versions" ]]; then
  echo "No GLIBC version requirements found in $binary; expected a dynamically linked GNU/Linux ELF." >&2
  exit 1
fi

while IFS= read -r version; do
  if [[ ! "$version" =~ ^[0-9]+(\.[0-9]+)+$ ]] ||
    [[ "$(printf '%s\n' "$baseline" "$version" | sort -V | tail -1)" != "$baseline" ]]; then
    echo "$binary requires GLIBC_$version; Ubuntu 22.04 baseline is GLIBC_$baseline. Build on Ubuntu 22.04." >&2
    exit 1
  fi
done <<< "$versions"

echo "$binary: GLIBC requirements <= $baseline (maximum $(printf '%s\n' "$versions" | tail -1))."
