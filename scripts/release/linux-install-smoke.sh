#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
packages=(/packages/*.deb)
if [[ ${#packages[@]} != 1 || ! -f "${packages[0]}" ]]; then
  echo 'Exactly one DEB is required' >&2
  exit 1
fi
apt_options=(-o Acquire::Retries=3 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20)
apt-get update "${apt_options[@]}"
apt-get install --yes --no-install-recommends "${apt_options[@]}" "${packages[0]}"
cute-screen --version > /evidence/version.txt
cute-screen --help > /evidence/help.txt
cute-screen --release-info > /evidence/release-info.json
uname -m > /evidence/architecture.txt
dpkg-query -W -f '${Version}\n' cute-screen > /evidence/package-version.txt
