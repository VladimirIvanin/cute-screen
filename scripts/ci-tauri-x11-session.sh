#!/usr/bin/env bash
# A window manager and a real StatusNotifierWatcher are required by native
# focus/shortcut/tray assertions; a bare Xvfb display cannot provide them.
set -euo pipefail
mkdir -p artifacts/tauri-e2e
xfwm4 --compositor=off >artifacts/tauri-e2e/window-manager.log 2>&1 &
wm_pid=$!
xfce4-panel --disable-wm-check >artifacts/tauri-e2e/panel.log 2>&1 &
panel_pid=$!
cleanup() {
  kill "$panel_pid" "$wm_pid" 2>/dev/null || true
  wait "$panel_pid" "$wm_pid" 2>/dev/null || true
}
trap cleanup EXIT
for attempt in {1..30}; do
  if gdbus call --session --dest org.freedesktop.DBus \
    --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner \
    org.kde.StatusNotifierWatcher | grep -q true; then
    pnpm test:e2e:tauri
    exit 0
  fi
  sleep 1
done
echo 'Native tray watcher did not start; refusing to skip tray assertions' >&2
exit 1
