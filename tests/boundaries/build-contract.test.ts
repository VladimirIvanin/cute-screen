import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { focusMainTauriWindow } from '../e2e/main-window'

interface PackageManifest {
  scripts?: Record<string, string>
}

describe('Tauri build boundary', () => {
  it('keeps shipped chrome CSS parseable by the oldest target WebView', async () => {
    const cssSources = await Promise.all(
      [
        path.join('packages', 'editor-vue', 'src', 'shell', 'shell.css'),
        path.join('apps', 'desktop', 'src', 'styles.css'),
      ].map(async (relativePath) => ({
        relativePath,
        source: await readFile(path.join(process.cwd(), relativePath), 'utf8'),
      })),
    )

    for (const { relativePath, source } of cssSources) {
      expect(source, relativePath).not.toContain('color-mix(')
      expect(source, relativePath).not.toMatch(/rgb\([^,)]*\s\/\s[^)]*\)/)

      const unprefixedBlurCount =
        source.match(/(?<!-)backdrop-filter:/g)?.length ?? 0
      const prefixedBlurCount =
        source.match(/-webkit-backdrop-filter:/g)?.length ?? 0
      expect(prefixedBlurCount, relativePath).toBe(unprefixedBlurCount)
    }
  })

  it('builds frontendDist before compiling the custom protocol feature', async () => {
    const root = process.cwd()
    const manifest = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8'),
    ) as PackageManifest
    const config = JSON.parse(
      await readFile(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'),
    ) as { build?: { frontendDist?: string } }

    expect(config.build?.frontendDist).toBe('../apps/desktop/dist')
    expect(manifest.scripts?.['build:frontend']).toBe(
      'vite build --config apps/desktop/vite.config.ts',
    )

    const rustCheckSteps = manifest.scripts?.['check:rust']?.split(' && ') ?? []
    const frontendBuildIndex = rustCheckSteps.indexOf('pnpm build:frontend')
    const customProtocolCompileIndex = rustCheckSteps.findIndex((step) =>
      step.includes('cargo clippy --workspace --lib --bins --all-features'),
    )

    expect(frontendBuildIndex).toBeGreaterThanOrEqual(0)
    expect(customProtocolCompileIndex).toBeGreaterThan(frontendBuildIndex)
  })

  it('selects the editor WebView before a real-Tauri scenario starts', async () => {
    const selectedLabels: string[] = []
    const configSource = await readFile(
      path.join(process.cwd(), 'tests', 'e2e', 'wdio.tauri.conf.ts'),
      'utf8',
    )

    await focusMainTauriWindow({
      switchToWindow: async (label) => {
        selectedLabels.push(label)
      },
    })

    expect(selectedLabels).toEqual(['main'])
    expect(configSource).toContain('await focusMainTauriWindow(browser)')
  })

  it('resolves an E2E harness query before evaluating the desktop app module', async () => {
    const mainSource = await readFile(
      path.join(process.cwd(), 'apps', 'desktop', 'src', 'main.ts'),
      'utf8',
    )

    expect(mainSource).not.toContain("import App from './App.vue'")
    expect(mainSource).toContain("(await import('./App.vue')).default")
  })

  it('grants the main WebView the window permissions required to sequence X11 capture', async () => {
    const capability = JSON.parse(
      await readFile(
        path.join(process.cwd(), 'src-tauri', 'capabilities', 'default.json'),
        'utf8',
      ),
    ) as { permissions?: readonly string[] }

    expect(capability.permissions).toEqual(
      expect.arrayContaining([
        'core:window:allow-hide',
        'core:window:allow-show',
      ]),
    )
  })

  it('keeps native file dialogs asynchronous and parented', async () => {
    const hostSource = await readFile(
      path.join(process.cwd(), 'src-tauri', 'src', 'lib.rs'),
      'utf8',
    )

    expect(hostSource).not.toContain('.blocking_pick_file()')
    expect(hostSource).not.toContain('.blocking_save_file()')
    expect(hostSource).toContain('.set_parent(&window)')
  })

  it('renders the X11 selector from canonical RGBA instead of a captured native image', async () => {
    const x11Source = await readFile(
      path.join(
        process.cwd(),
        'src-tauri',
        'src',
        'platform',
        'linux',
        'x11.rs',
      ),
      'utf8',
    )

    expect(x11Source).not.toContain('native.put(connection, overlay')
    expect(x11Source).toContain('encode_selector_image(')
    expect(x11Source).not.toContain('.function(GX::XOR)')
    expect(x11Source).toContain('.background_pixmap(frozen_pixmap)')
    expect(x11Source).toContain('restore_selector_visual(')
  })

  it('keeps the accepted macOS Area selector visible until quick chrome reveals', async () => {
    const bridgeSource = await readFile(
      path.join(process.cwd(), 'src-tauri', 'src', 'macos_capture_bridge.m'),
      'utf8',
    )
    const platformSource = await readFile(
      path.join(
        process.cwd(),
        'src-tauri',
        'src',
        'platform',
        'macos',
        'capture.rs',
      ),
      'utf8',
    )
    const hostSource = await readFile(
      path.join(process.cwd(), 'src-tauri', 'src', 'lib.rs'),
      'utf8',
    )

    expect(bridgeSource).toContain('cute_selector_complete_handoff')
    expect(bridgeSource).toContain('CuteRetainAreaSelectorHandoff')
    expect(platformSource).toContain('complete_selector_handoff')
    expect(hostSource).toContain('macos_platform::complete_selector_handoff()')
    expect(hostSource).toMatch(
      /fn quick_capture_dismiss[\s\S]*macos_platform::complete_selector_handoff\(\)/,
    )
  })

  it('keeps X11 Area selection inside the mounted Quick surface', async () => {
    const platformSource = await readFile(
      path.join(
        process.cwd(),
        'src-tauri',
        'src',
        'platform',
        'linux',
        'x11.rs',
      ),
      'utf8',
    )
    const hostSource = await readFile(
      path.join(process.cwd(), 'src-tauri', 'src', 'lib.rs'),
      'utf8',
    )
    const quickSource = await readFile(
      path.join(process.cwd(), 'apps', 'desktop', 'src', 'QuickCaptureApp.vue'),
      'utf8',
    )
    const areaStart = platformSource.indexOf('pub fn capture_area_to_transport')
    const areaEnd = platformSource.indexOf(
      'pub fn capture_window_to_transport',
      areaStart,
    )
    const areaSource = platformSource.slice(areaStart, areaEnd)

    expect(areaStart).toBeGreaterThanOrEqual(0)
    expect(areaEnd).toBeGreaterThan(areaStart)
    expect(areaSource).not.toContain('select_frozen_target(')
    expect(areaSource).toContain('result.quick_selection_pending = true')
    expect(hostSource).not.toContain('x11_platform::complete_selector_handoff')
    expect(quickSource).toContain(':quick-selection-mode="selectionPending"')
    expect(quickSource).toContain(
      '@quick-selection-complete="onQuickSelectionComplete"',
    )
    expect(hostSource).toMatch(
      /fn quick_capture_warmup[\s\S]*set_focusable\(false\)[\s\S]*set_opacity\(0\.01\)[\s\S]*window\.show\(\)/,
    )
    expect(hostSource).toMatch(
      /fn quick_capture_reveal[\s\S]*set_opacity\(1\.0\)[\s\S]*set_focusable\(true\)[\s\S]*window\.set_focus\(\)/,
    )
  })

  it('keeps Windows Area selection inside the mounted Quick surface', async () => {
    const platformSource = await readFile(
      path.join(
        process.cwd(),
        'src-tauri',
        'src',
        'platform',
        'windows',
        'capture.rs',
      ),
      'utf8',
    )
    const captureStart = platformSource.indexOf('pub fn capture_to_transport')
    const captureEnd = platformSource.indexOf(
      'fn log_capture_timing',
      captureStart,
    )
    const captureSource = platformSource.slice(captureStart, captureEnd)

    expect(captureStart).toBeGreaterThanOrEqual(0)
    expect(captureEnd).toBeGreaterThan(captureStart)
    expect(platformSource).toContain(
      'CaptureTarget::Area => CaptureExecutionOrder::FrameForQuickSelection',
    )
    expect(platformSource).toContain(
      'quick_selection_pending: uses_mounted_quick_selection(target)',
    )
    expect(platformSource).not.toContain('fn area_geometry(')
    expect(captureSource).not.toContain('select_on_virtual_desktop(')
    expect(captureSource).toContain(
      'capture_fresh_compositor_frame(&source_geometry, correlation_id)',
    )
    expect(platformSource).toMatch(
      /fn capture_fresh_compositor_frame[\s\S]*prepare_compositor_capture\([\s\S]*CompositorPulse::show\([\s\S]*flush_desktop_composition\([\s\S]*capture_prepared_compositor_outputs\(/,
    )
    expect(platformSource).toMatch(
      /impl CompositorPulse[\s\S]*SELECTOR_CLASS_REGISTERED\.get_or_init\(register_selector_class\)/,
    )
  })

  it('hands Windows Quick Capture to the editor once without remapping the dismissed window', async () => {
    const hostSource = await readFile(
      path.join(process.cwd(), 'src-tauri', 'src', 'lib.rs'),
      'utf8',
    )
    const dismissStart = hostSource.indexOf('fn quick_capture_dismiss')
    const dismissEnd = hostSource.indexOf('#[tauri::command]', dismissStart + 1)
    const dismissSource = hostSource.slice(dismissStart, dismissEnd)
    const windowsDismissSource = dismissSource.match(
      /#\[cfg\(target_os = "windows"\)\]\s*\{([\s\S]*?)\n\s*\}/,
    )?.[1]

    expect(hostSource).toMatch(
      /fn quick_capture_commit[\s\S]*commit_quick_draft\([\s\S]*prepare_quick_capture_editor_handoff\([\s\S]*timeout\(/,
    )
    expect(hostSource).toMatch(
      /fn prepare_quick_capture_editor_handoff[\s\S]*show_editor\([\s\S]*set_always_on_top\(false\)/,
    )
    expect(dismissSource).toMatch(
      /target_os = "windows"[\s\S]*set_always_on_top\(false\)[\s\S]*window\.hide\(\)/,
    )
    expect(windowsDismissSource).toBeDefined()
    expect(windowsDismissSource).not.toContain('set_fullscreen(false)')
    expect(hostSource).toMatch(
      /fn quick_capture_present[\s\S]*target_os = "windows"[\s\S]*set_always_on_top\(true\)[\s\S]*set_fullscreen\(true\)/,
    )
  })

  it('stages the X11 Area frame before the single Quick selection surface maps', async () => {
    const platformSource = await readFile(
      path.join(
        process.cwd(),
        'src-tauri',
        'src',
        'platform',
        'linux',
        'x11.rs',
      ),
      'utf8',
    )
    const hostSource = await readFile(
      path.join(process.cwd(), 'src-tauri', 'src', 'lib.rs'),
      'utf8',
    )

    expect(platformSource).toMatch(
      /fn capture_area_to_transport[\s\S]*capture_native_root_frame\([\s\S]*decode_native_root_frame\([\s\S]*import_quick_rgba_preview\(/,
    )
    expect(hostSource).toMatch(
      /fn hide_editor_for_native_capture[\s\S]*current_process_windows_unmapped\([\s\S]*window[\s\S]*\.hide\(\)/,
    )
  })
})
