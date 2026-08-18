#!/usr/bin/env bash
# Install Tauri/WebKitGTK packages on GitHub-hosted Ubuntu runners.
#
# azure.archive.ubuntu.com is first in the runner mirrorlist and can stall
# for tens of minutes. Bounded apt timeouts plus a public-archive fallback
# keep this step from consuming the whole job budget.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <apt-package>..." >&2
  exit 2
fi

rewrite_azure_mirrors() {
  local file replacement
  if [[ "$(dpkg --print-architecture)" == "amd64" ]]; then
    replacement="http://archive.ubuntu.com/ubuntu"
  else
    replacement="http://ports.ubuntu.com/ubuntu-ports"
  fi
  for file in /etc/apt/apt-mirrors.txt /etc/apt/sources.list /etc/apt/sources.list.d/ubuntu.sources; do
    if [[ -f "${file}" ]]; then
      sudo sed -i \
        -e "s|https\\?://azure\\.archive\\.ubuntu\\.com/ubuntu-ports|${replacement}|g" \
        -e "s|https\\?://azure\\.archive\\.ubuntu\\.com/ubuntu|${replacement}|g" \
        "${file}"
    fi
  done
}

rewrite_azure_mirrors

APT_OPTS=(
  -o Acquire::Retries=3
  -o Acquire::http::Timeout=20
  -o Acquire::https::Timeout=20
  -o Acquire::ftp::Timeout=20
)

attempt=1
while true; do
  if sudo DEBIAN_FRONTEND=noninteractive apt-get update "${APT_OPTS[@]}" &&
    sudo DEBIAN_FRONTEND=noninteractive apt-get install \
      --yes --no-install-recommends "${APT_OPTS[@]}" "$@"; then
    exit 0
  fi
  if ((attempt >= 3)); then
    echo "apt-get failed after ${attempt} attempts" >&2
    exit 1
  fi
  echo "apt-get failed (attempt ${attempt}); retrying..." >&2
  sleep $((attempt * 5))
  attempt=$((attempt + 1))
done
