import { spawnSync } from 'node:child_process'
import net from 'node:net'
import {
  copyFile,
  chmod,
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { cacheDownloadedEdgeDriver } from './tauri-driver-cache.mjs'

const root = process.cwd()
const artifacts = path.join(root, 'artifacts', 'tauri-e2e')
await mkdir(artifacts, { recursive: true })
const runtimeDirectory = path.join(artifacts, 'runtime')
const driverCache = path.join(artifacts, 'driver-cache')
await mkdir(runtimeDirectory, { recursive: true })

const embeddedWebDriverPort = Number.parseInt(process.env.TAURI_WEBDRIVER_PORT ?? '4445', 10)

const scenarios = [
  { id: 'mockups', persistenceGroup: 'mockups', spec: 'tests/e2e/specs/tauri-mockups.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  { id: 'mockups-reopen', persistenceGroup: 'mockups', spec: 'tests/e2e/specs/tauri-mockups-reopen.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  { id: 'phone-orientation', spec: 'tests/e2e/specs/tauri-phone-orientation.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  { id: 'capture-lifecycle', spec: 'tests/e2e/specs/tauri-capture-lifecycle.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'mcp', persistenceGroup: 'mcp', spec: 'tests/e2e/specs/tauri-mcp.e2e.ts', harnessQuery: '?m04=1', fakeCapture: true },
  { id: 'mcp-skill', spec: 'tests/e2e/specs/tauri-mcp-skill.e2e.ts', harnessQuery: '?m04=1&m08=1' },
  { id: 'mcp-reopen', persistenceGroup: 'mcp', spec: 'tests/e2e/specs/tauri-mcp-reopen.e2e.ts', harnessQuery: '?m04=1', fakeCapture: true },
  { id: 'frame-snap', spec: 'tests/e2e/specs/tauri-frame-snap.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'frame-seams', spec: 'tests/e2e/specs/tauri-frame-seams.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'blur-optimization', spec: 'tests/e2e/specs/tauri-blur-optimization.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'numeric-keyboard', spec: 'tests/e2e/specs/tauri-numeric-keyboard.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'creative-fonts', persistenceGroup: 'creative-fonts', spec: 'tests/e2e/specs/tauri-creative-fonts.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  { id: 'creative-fonts-reopen', persistenceGroup: 'creative-fonts', spec: 'tests/e2e/specs/tauri-creative-fonts-reopen.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  { id: 'composition', persistenceGroup: 'composition', spec: 'tests/e2e/specs/tauri-composition.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'composition-reopen', persistenceGroup: 'composition', spec: 'tests/e2e/specs/tauri-composition-reopen.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  { id: 'gradient', persistenceGroup: 'gradient', spec: 'tests/e2e/specs/tauri-gradient.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'gradient-reopen', persistenceGroup: 'gradient', spec: 'tests/e2e/specs/tauri-gradient-reopen.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  {
    id: 'windows-area-edges',
    spec: 'tests/e2e/specs/tauri-windows-area-edges.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    interactiveWindows: true,
    driverProvider: 'external',
  },
  { id: 'area-escape', spec: 'tests/e2e/specs/tauri-area-escape.e2e.ts', harnessQuery: '?m04=1' },
  { id: 'landing-assets', spec: 'tests/e2e/specs/tauri-landing-assets.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  { id: 'emoji-link', spec: 'tests/e2e/specs/tauri-emoji-link.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'emoji', persistenceGroup: 'emoji', spec: 'tests/e2e/specs/tauri-emoji.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'emoji-reopen', persistenceGroup: 'emoji', spec: 'tests/e2e/specs/tauri-emoji-reopen.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  { id: 'quick-history', persistenceGroup: 'quick-history', spec: 'tests/e2e/specs/tauri-quick-history.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'quick-history-reopen', persistenceGroup: 'quick-history', spec: 'tests/e2e/specs/tauri-quick-history-reopen.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  { id: 'line', persistenceGroup: 'line', spec: 'tests/e2e/specs/tauri-line.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'line-reopen', persistenceGroup: 'line', spec: 'tests/e2e/specs/tauri-line-reopen.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  {
    id: 'window-capture',
    spec: 'tests/e2e/specs/tauri-window-capture.e2e.ts',
    harnessQuery: '?m04=1',
    interactiveWindows: true,
    driverProvider: 'external',
  },
  { id: 'hand-drawn', persistenceGroup: 'hand-drawn', spec: 'tests/e2e/specs/tauri-hand-drawn.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'hand-drawn-reopen', persistenceGroup: 'hand-drawn', spec: 'tests/e2e/specs/tauri-hand-drawn-reopen.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  { id: 'hand-drawn-line', persistenceGroup: 'hand-drawn-line', spec: 'tests/e2e/specs/tauri-hand-drawn-line.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'hand-drawn-line-reopen', persistenceGroup: 'hand-drawn-line', spec: 'tests/e2e/specs/tauri-hand-drawn-line-reopen.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  { id: 'shape-paint', persistenceGroup: 'shape-paint', spec: 'tests/e2e/specs/tauri-shape-paint.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'shape-paint-reopen', persistenceGroup: 'shape-paint', spec: 'tests/e2e/specs/tauri-shape-paint-reopen.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  {
    id: 'brand-eyes',
    spec: 'tests/e2e/specs/tauri-brand-eyes.e2e.ts',
    harnessQuery: '?m04=1',
    driverProvider: 'external',
  },
  { id: 'callout-editing', persistenceGroup: 'callout-editing', spec: 'tests/e2e/specs/tauri-callout-editing.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' },
  { id: 'callout-editing-reopen', persistenceGroup: 'callout-editing', spec: 'tests/e2e/specs/tauri-callout-editing-reopen.e2e.ts', harnessQuery: '?m04=1&m08=1', driverProvider: 'external' },
  { id: 'tray-locale', persistenceGroup: 'tray-locale', spec: 'tests/e2e/specs/tauri-tray-locale.e2e.ts', harnessQuery: '?m04=1' },
  { id: 'macos-available-actions', spec: 'tests/e2e/specs/tauri-macos-available-actions.e2e.ts', harnessQuery: '?m04=1' },
  ...(process.platform === 'linux' ? [{ id: 'linux-tray-menu', spec: 'tests/e2e/specs/tauri-linux-tray-menu.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external' }] : []),
  { id: 'macos-app-menu', spec: 'tests/e2e/specs/tauri-macos-app-menu.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true },
  { id: 'tray-locale-reopen', persistenceGroup: 'tray-locale', spec: 'tests/e2e/specs/tauri-tray-locale-reopen.e2e.ts', harnessQuery: '?m04=1' },
  {
    id: 'selection-toolbar-chrome',
    spec: 'tests/e2e/specs/tauri-selection-toolbar-chrome.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
  },
  {
    id: 'history-settings',
    spec: 'tests/e2e/specs/tauri-history-settings.e2e.ts',
    harnessQuery: '?m04=1',
    driverProvider: 'external',
  },
  {
    id: 'selection-interactions',
    spec: 'tests/e2e/specs/tauri-selection-interactions.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
  },
  {
    id: 'export-filename-settings',
    spec: 'tests/e2e/specs/tauri-export-filename-settings.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    driverProvider: 'external',
  },
  {
    id: 'editor-settings',
    spec: 'tests/e2e/specs/tauri-editor-settings.e2e.ts',
    harnessQuery: '?m04=1',
    fakeCapture: true,
    driverProvider: 'external',
  },
  {
    id: 'result-export',
    spec: 'tests/e2e/specs/tauri-result-export.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    driverProvider: 'external',
  },
  { id: 'history', persistenceGroup: 'history', spec: 'tests/e2e/specs/tauri-history.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true },
  { id: 'history-reopen', persistenceGroup: 'history', spec: 'tests/e2e/specs/tauri-history-reopen.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true },
  { id: 'history-delete', persistenceGroup: 'history', spec: 'tests/e2e/specs/tauri-history-delete.e2e.ts', harnessQuery: '?m04=1&m08=1', fakeCapture: true },
  {
    id: 'ruler-toolbar', persistenceGroup: 'ruler-toolbar',
    spec: 'tests/e2e/specs/tauri-ruler-toolbar.e2e.ts',
    harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external',
  },
  {
    id: 'ruler-toolbar-reopen', persistenceGroup: 'ruler-toolbar',
    spec: 'tests/e2e/specs/tauri-ruler-toolbar-reopen.e2e.ts',
    harnessQuery: '?m04=1&m08=1', fakeCapture: true, driverProvider: 'external',
  },
  {
    id: 'ruler-shift',
    spec: 'tests/e2e/specs/tauri-ruler-shift.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
  },
  {
    id: 'straight-strokes',
    persistenceGroup: 'straight-strokes',
    spec: 'tests/e2e/specs/tauri-straight-strokes.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
  },
  {
    id: 'straight-strokes-reopen',
    persistenceGroup: 'straight-strokes',
    spec: 'tests/e2e/specs/tauri-straight-strokes-reopen.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
  },
  {
    id: 'activation-capture',
    spec: 'tests/e2e/specs/tauri-activation-capture.e2e.ts',
    harnessQuery: '?m04=1',
  },
  {
    id: 'activation-settings',
    persistenceGroup: 'activation-settings',
    spec: 'tests/e2e/specs/tauri-activation-settings.e2e.ts',
    harnessQuery: '?m02=ready',
  },
  {
    id: 'activation-reopen',
    persistenceGroup: 'activation-settings',
    spec: 'tests/e2e/specs/tauri-activation-reopen.e2e.ts',
    harnessQuery: '?m02=ready',
  },
  {
    id: 'brushes',
    persistenceGroup: 'brushes',
    spec: 'tests/e2e/specs/tauri-brushes.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
  },
  {
    id: 'brushes-reopen',
    spec: 'tests/e2e/specs/tauri-brushes-reopen.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    persistenceGroup: 'brushes',
    driverProvider: 'external',
  },
  {
    id: 'ruler-bounds',
    spec: 'tests/e2e/specs/tauri-ruler-bounds.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
  },
  {
    id: 'spotlight-preview',
    spec: 'tests/e2e/specs/tauri-spotlight-preview.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
  },
  {
    id: 'ruler-resolution',
    spec: 'tests/e2e/specs/tauri-ruler-resolution.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'center-rotation',
    spec: 'tests/e2e/specs/tauri-center-rotation.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'loupe-settings',
    spec: 'tests/e2e/specs/tauri-loupe-settings.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'numbered-marker',
    spec: 'tests/e2e/specs/tauri-numbered-marker.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
  },
  {
    id: 'tool-lifecycle',
    spec: 'tests/e2e/specs/tauri-tool-lifecycle.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
    // WebKitGTK 2.52.6 automation turns right-button release into a left click.
    contextInput: process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'x11' ? 'x11' : 'webdriver',
  },
  {
    id: 'tool-settings',
    spec: 'tests/e2e/specs/tauri-tool-settings.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    persistenceGroup: 'tool-settings',
  },
  {
    id: 'tool-settings-reopen',
    spec: 'tests/e2e/specs/tauri-tool-settings-reopen.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    persistenceGroup: 'tool-settings',
  },
  {
    id: 'custom-icons',
    spec: 'tests/e2e/specs/tauri-custom-icons.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'censor-toolbar',
    spec: 'tests/e2e/specs/tauri-censor-toolbar.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
    contextInput: process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'x11' ? 'x11' : 'webdriver',
  },
  {
    id: 'shape-defaults-placement',
    spec: 'tests/e2e/specs/tauri-shape-defaults-placement.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'highlighter',
    spec: 'tests/e2e/specs/tauri-highlighter.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'toolbar-separators',
    spec: 'tests/e2e/specs/tauri-toolbar-separators.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
  },
  {
    id: 'quick-editor-handoff',
    spec: 'tests/e2e/specs/tauri-quick-editor-handoff.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'shape-toolbar',
    spec: 'tests/e2e/specs/tauri-shape-toolbar.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'windows-capture-exclusion',
    spec: 'tests/e2e/specs/tauri-windows-capture-exclusion.e2e.ts',
    harnessQuery: '?m04=1',
    interactiveWindows: true,
  },
  {
    id: 'foundation',
    spec: 'tests/e2e/specs/tauri-foundation.e2e.ts',
  },
  {
    id: 'shell',
    spec: 'tests/e2e/specs/tauri-shell.e2e.ts',
    harnessQuery: '?m02=ready',
  },
  {
    id: 'window-paint',
    spec: 'tests/e2e/specs/tauri-window-paint.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
  },
  {
    id: 'arrow',
    spec: 'tests/e2e/specs/tauri-arrow.e2e.ts',
    harnessQuery: '?m05=1',
  },
  {
    id: 'callout-layout',
    spec: 'tests/e2e/specs/tauri-callout-layout.e2e.ts',
    harnessQuery: '?m05=1&m05viewport=1',
  },
  {
    id: 'v7-rich-text',
    spec: 'tests/e2e/specs/tauri-v7-rich-text.e2e.ts',
    harnessQuery: '?m05=1',
  },
  {
    id: 'm05-viewport',
    spec: 'tests/e2e/specs/tauri-m05-viewport.e2e.ts',
    harnessQuery: '?m05=1&m05viewport=1',
  },
  {
    id: 'content-image-tool',
    spec: 'tests/e2e/specs/tauri-content-image-tool.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
    driverProvider: 'external',
    persistenceGroup: 'image-ingress',
  },
  {
    id: 'content-image-reopen',
    spec: 'tests/e2e/specs/tauri-content-image-reopen.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    driverProvider: 'external',
    persistenceGroup: 'image-ingress',
  },
  {
    id: 'content-image-empty',
    spec: 'tests/e2e/specs/tauri-content-image-empty.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    driverProvider: 'external',
  },
  {
    id: 'document-write',
    spec: 'tests/e2e/specs/document-persistence-write.e2e.ts',
    harnessQuery: '?m03=1',
    persistenceGroup: 'm03',
  },
  {
    id: 'document-reopen',
    spec: 'tests/e2e/specs/document-persistence-reopen.e2e.ts',
    harnessQuery: '?m03=1',
    persistenceGroup: 'm03',
  },
  {
    id: 'm04-clean-profile-capture',
    spec: 'tests/e2e/specs/m04-clean-profile-capture.e2e.ts',
    harnessQuery: '?m04=1',
    fakeCapture: true,
  },
  {
    id: 'creation-settings',
    spec: 'tests/e2e/specs/tauri-creation-settings.e2e.ts',
    harnessQuery: '?m04=1',
    fakeCapture: true,
  },
  {
    id: 'quick-chrome',
    spec: 'tests/e2e/specs/tauri-quick-chrome.e2e.ts',
    harnessQuery: '?m04=1',
    fakeCapture: true,
  },
  {
    id: 'm08-crop-first-open',
    spec: 'tests/e2e/specs/tauri-m08-crop-first-open.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'm08-eyedropper-clipboard',
    spec: 'tests/e2e/specs/tauri-m08-eyedropper-clipboard.e2e.ts',
    harnessQuery: '?m04=1&m08=1',
    fakeCapture: true,
  },
  {
    id: 'renderer-alpha',
    spec: 'tests/e2e/specs/tauri-renderer-alpha.e2e.ts',
    harnessQuery: '?m01=1&token=m01-alpha-png',
  },
  {
    id: 'renderer-binary',
    spec: 'tests/e2e/specs/tauri-renderer-binary.e2e.ts',
    harnessQuery: '?m01=1&assetFailure=1&token=m01-icc-png',
  },
  {
    id: 'renderer-exif',
    spec: 'tests/e2e/specs/tauri-renderer-exif.e2e.ts',
    harnessQuery: '?m01=1&token=m01-exif-png',
  },
  {
    id: 'renderer-corrupted',
    spec: 'tests/e2e/specs/tauri-renderer-corrupted.e2e.ts',
    harnessQuery: '?m01=1&token=m01-corrupted-png',
  },
]

scenarios.push(
  { id: 'wayland-single-shot', persistenceGroup: 'wayland-single-shot', spec: 'tests/e2e/specs/tauri-wayland-single-shot.e2e.ts', harnessQuery: '?m04=1', interactiveWayland: true },
  { id: 'wayland-single-shot-reopen', persistenceGroup: 'wayland-single-shot', spec: 'tests/e2e/specs/tauri-wayland-single-shot-reopen.e2e.ts', harnessQuery: '?m04=1', interactiveWayland: true },
)

const requestedScenarioIds = new Set(
  (process.env.CUTE_SCREEN_E2E_SCENARIOS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
)
const selectedScenarios =
  requestedScenarioIds.size === 0
    ? scenarios.filter((scenario) => !scenario.interactiveWindows && !scenario.interactiveWayland)
    : scenarios.filter(({ id }) => requestedScenarioIds.has(id))
if (selectedScenarios.some((scenario) => scenario.interactiveWindows) && process.platform !== 'win32') {
  throw new Error('windows-capture-exclusion requires an interactive Windows desktop')
}
const unknownScenarioIds = [...requestedScenarioIds].filter((id) => !scenarios.some((scenario) => scenario.id === id))
if (unknownScenarioIds.length > 0) {
  throw new Error(`Unknown Tauri E2E scenarios: ${unknownScenarioIds.join(', ')}`)
}

function isolatedAppDataEnvironment(directory) {
  const environment = { CUTE_SCREEN_E2E_APP_DATA: directory }

  if (process.platform === 'darwin') {
    // The installed app may be running in the same login session. Give the
    // harness its own activation socket without changing the user's app.
    return { ...environment, XDG_SESSION_ID: `cute-screen-e2e-${path.basename(directory)}` }
  }

  if (process.platform === 'linux') {
    return {
      ...environment,
      XDG_SESSION_ID: `cute-screen-e2e-${path.basename(directory)}`,
      XDG_CACHE_HOME: path.join(directory, 'cache'),
      XDG_CONFIG_HOME: path.join(directory, 'config'),
      XDG_DATA_HOME: path.join(directory, 'data'),
      XDG_STATE_HOME: path.join(directory, 'state'),
    }
  }

  if (process.platform === 'win32') {
    return {
      ...environment,
      APPDATA: path.join(directory, 'roaming'),
      LOCALAPPDATA: path.join(directory, 'local'),
      WEBVIEW2_USER_DATA_FOLDER: path.join(directory, 'webview2'),
    }
  }

  return environment
}

function run(
  command,
  args,
  extraEnv = {},
) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: process.platform === 'win32' && command !== process.execPath,
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

function isPortInUse(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        resolve(false)
        return
      }
      reject(error)
    })
  })
}

async function waitForPortFree(
  port,
  timeoutMs = 30_000,
) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const inUse = await isPortInUse(port)
    if (!inUse) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(
    `Embedded WebDriver port ${port} is still in use after ${timeoutMs}ms; previous app instance did not exit`,
  )
}

const cargoTargetDirectory = process.env.CARGO_TARGET_DIR
  ? path.resolve(root, process.env.CARGO_TARGET_DIR)
  : path.join(root, 'target')
const builtExecutable = path.join(
  cargoTargetDirectory,
  'debug',
  process.platform === 'win32' ? 'cute-screen.exe' : 'cute-screen',
)
const wdioCli = path.join(root, 'node_modules', '@wdio', 'cli', 'bin', 'wdio.js')

const failedScenarios = []
const retainedAppDataDirs = []
const persistenceDirectories = new Map()
const temporaryBuildDirectories = []

try {
  if (run('pnpm', ['fixtures:generate:m01']) !== 0) {
    throw new Error('Tauri E2E fixture generation failed; application will not be launched')
  }
  let frontendOverride
  if (process.env.CUTE_SCREEN_FRONTEND_DIST) {
    const directory = await mkdtemp(path.join(runtimeDirectory, 'frontend-config-'))
    temporaryBuildDirectories.push(directory)
    frontendOverride = path.join(directory, 'tauri.frontend.json')
    await writeFile(frontendOverride, JSON.stringify({
      build: {
        frontendDist: path.relative(
          path.join(root, 'src-tauri'),
          path.resolve(root, process.env.CUTE_SCREEN_FRONTEND_DIST),
        ).replaceAll(path.sep, '/'),
      },
    }))
  }
  const buildStatus = run(
    process.execPath,
    [
      path.join(root, 'scripts', 'tauri.mjs'),
      'build',
      '--debug',
      '--no-bundle',
      '--features',
      'fake-platform,test-harness',
      '--config',
      'src-tauri/tauri.test.conf.json',
      ...(frontendOverride ? ['--config', frontendOverride] : []),
    ],
    {
      VITE_TEST_HARNESS: 'true',
      VITE_M01_HARNESS: 'true',
      CARGO_TARGET_DIR: cargoTargetDirectory,
    },
  )

  if (buildStatus !== 0) {
    throw new Error('Tauri E2E build failed; refusing to test a stale application binary')
  }

  // Other desktop tasks may rebuild target/debug while this suite is running.
  // Pin the successfully built harness before starting any driver or scenario.
  const binaryDirectory = await mkdtemp(path.join(runtimeDirectory, 'cute-screen-e2e-binary-'))
  temporaryBuildDirectories.push(binaryDirectory)
  const executable = path.join(binaryDirectory, path.basename(builtExecutable))
  await copyFile(builtExecutable, executable)
  const companionName = process.platform === 'win32' ? 'cute-screen-mcp.exe' : 'cute-screen-mcp'
  await copyFile(path.join(path.dirname(builtExecutable), companionName), path.join(binaryDirectory, companionName))
  const help = spawnSync(executable, ['--e2e-harness-query=?m04=1', '--startup-check'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (help.status !== 0) {
    throw new Error('Built binary is not the test harness; another build may have replaced target/debug')
  }
  console.info(`Pinned Tauri test binary: ${executable}`)

  for (const scenario of selectedScenarios) {
    const group = scenario.persistenceGroup
    if (group && !persistenceDirectories.has(group)) {
      persistenceDirectories.set(group, await mkdtemp(path.join(runtimeDirectory, `cute-screen-e2e-${group}-`)))
    }
    const appData = group
      ? persistenceDirectories.get(group)
      : await mkdtemp(path.join(runtimeDirectory, `cute-screen-e2e-${scenario.id}-`))

    await waitForPortFree(embeddedWebDriverPort)

    const scenarioEnv = {
      ...isolatedAppDataEnvironment(appData),
      CUTE_SCREEN_WDIO_APP_BINARY: executable,
      CUTE_SCREEN_WDIO_ARTIFACTS: artifacts,
      CUTE_SCREEN_E2E_SCENARIO: scenario.id,
      CUTE_SCREEN_E2E_DRIVER_PROVIDER: process.env.CUTE_SCREEN_E2E_DRIVER_PROVIDER
        ?? scenario.driverProvider ?? (process.platform === 'win32' ? 'external' : 'embedded'),
      CUTE_SCREEN_E2E_CONTEXT_INPUT: process.env.CUTE_SCREEN_E2E_CONTEXT_INPUT ?? scenario.contextInput ?? 'webdriver',
      ...(process.platform === 'win32' ? {
        TEMP: runtimeDirectory,
        TMP: runtimeDirectory,
        PATH: `${driverCache}${path.delimiter}${process.env.PATH ?? ''}`,
      } : {}),
    }
    if (scenario.id === 'emoji-link' && process.platform === 'linux') {
      // Observe the real plugin's OS dispatch without opening browser tabs in CI.
      const openerDirectory = path.join(appData, 'browser-dispatch')
      await mkdir(openerDirectory, { recursive: true })
      const dispatchLog = path.join(artifacts, 'emoji-link-dispatch.log')
      await writeFile(dispatchLog, '')
      const opener = path.join(openerDirectory, 'xdg-open')
      await writeFile(opener, '#!/bin/sh\nprintf \'%s\\n\' "$1" >> "$CUTE_SCREEN_E2E_BROWSER_DISPATCH_LOG"\n')
      await chmod(opener, 0o755)
      scenarioEnv.PATH = `${openerDirectory}${path.delimiter}${process.env.PATH ?? ''}`
      scenarioEnv.CUTE_SCREEN_E2E_BROWSER_DISPATCH_LOG = dispatchLog
    }
    if (scenario.harnessQuery) {
      scenarioEnv.CUTE_SCREEN_E2E_HARNESS_QUERY = scenario.harnessQuery
    }
    if (scenario.fakeCapture) {
      scenarioEnv.CUTE_SCREEN_E2E_FAKE_CAPTURE = '1'
    }
    console.info(
      `Tauri E2E scenario ${scenario.id}: driverProvider=${scenarioEnv.CUTE_SCREEN_E2E_DRIVER_PROVIDER}, contextInput=${scenarioEnv.CUTE_SCREEN_E2E_CONTEXT_INPUT}`,
    )

    const status = run(
      process.execPath,
      [wdioCli, 'run', 'tests/e2e/wdio.tauri.conf.ts', '--spec', scenario.spec],
      scenarioEnv,
    )
    if (process.platform === 'win32') await cacheDownloadedEdgeDriver(path.join(runtimeDirectory, 'msedgedriver'), driverCache)

    if (status === 0 && !group) {
      await rm(appData, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
      continue
    }

    if (status === 0) continue

    failedScenarios.push(scenario.id)
    retainedAppDataDirs.push(appData)
  }
} catch (error) {
  process.exitCode = 1
  throw error
} finally {
  for (const directory of temporaryBuildDirectories) {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
  }
}

for (const [group, directory] of persistenceDirectories) {
  const failed = selectedScenarios.some(
    (scenario) => scenario.persistenceGroup === group && failedScenarios.includes(scenario.id),
  )
  if (failed) {
    if (!retainedAppDataDirs.includes(directory)) retainedAppDataDirs.push(directory)
  } else {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
  }
}

if (failedScenarios.length > 0) {
  process.exitCode = 1
  throw new Error(
    `Tauri E2E failed for: ${failedScenarios.join(', ')}; retained appData=${retainedAppDataDirs.join(', ')}`,
  )
}
