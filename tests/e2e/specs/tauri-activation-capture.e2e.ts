import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'

const execute = promisify(execFile)

async function waitForHiddenApplication(executable: string): Promise<void> {
  const { stdout } = await execute('pgrep', ['-f', `^${executable}( |$)`])
  const processes = stdout.trim().split('\n')
  expect(processes).toHaveLength(1)
  await browser.waitUntil(async () => {
    try {
      const visible = await execute('xdotool', ['search', '--all', '--onlyvisible', '--pid', processes[0]!, '--name', '^Cute Screen'])
      return visible.stdout.trim() === ''
    } catch (cause) {
      if (
        typeof cause === 'object' &&
        cause &&
        'code' in cause &&
        cause.code === 1
      ) return true
      throw cause
    }
  })
}

describe('global shortcut to decoded native capture', () => {
  it('captures from a hidden resident process and decodes the materialized original in the real WebView', async function () {
    if (process.platform !== 'linux' || process.env.XDG_SESSION_TYPE === 'wayland') {
      this.skip()
      return
    }
    const executable = process.env.CUTE_SCREEN_WDIO_APP_BINARY
    if (!executable) throw new Error('Missing harness executable')
    await execute(executable, ['settings', '--section', 'shortcuts'])
    await browser.tauri.switchWindow('settings')
    await $('select[aria-label="Language / Язык"]').selectByAttribute('value', 'en')
    await $('button[aria-label="Change: Capture area"]').click()
    await $('.cs-record-shortcut').click()
    await browser.keys([Key.Control, Key.Alt, Key.Shift, '8'])
    await expect($('p=Available in registration check')).toBeDisplayed()
    await $('button=Assign').click()
    await expect($('[data-action="capture-area"] kbd')).toHaveText('Ctrl+Alt+Shift+8')
    await $('button=Done').click()
    await browser.tauri.switchWindow('main')
    await browser.waitUntil(async () => !(await browser.tauri.listWindows()).includes('settings'))
    await browser.execute(async () => {
      await window.__cuteScreenE2eWindow?.hide()
    })
    await waitForHiddenApplication(executable)
    await execute('xdotool', ['key', '--clearmodifiers', '--delay', '100', 'ctrl+alt+shift+8'])
    try {
      // Selecting a WebDriver window maps it. Wait for the native frozen frame
      // before selecting the prewarmed overlay, or automation itself blocks unmap.
      await browser.waitUntil(async () => browser.execute(async () => {
        const core = (window as typeof window & {
          __TAURI__: { core: { invoke(command: string): Promise<unknown> } }
        }).__TAURI__.core
        return (await core.invoke('quick_capture_get_active')) !== null
      }))
      await browser.tauri.switchWindow('quick-capture')
      await expect($('.cs-quick-selection-hint')).toBeDisplayed()
      await expect($('.cs-quick-capture')).toHaveAttribute('class', expect.stringContaining('is-layout-ready'))
    } catch (cause) {
      const diagnostics = await browser.execute(async () => {
        const core = (window as typeof window & {
          __TAURI__: { core: { invoke(command: string): Promise<unknown> } }
        }).__TAURI__.core
        return { draft: await core.invoke('quick_capture_get_active'), diagnostics: await core.invoke('capture_diagnostics'), text: document.body.innerText }
      })
      throw new Error(`Global capture did not present: ${JSON.stringify(diagnostics)}`, { cause })
    }
    await browser.execute(async () => {
      const core = (window as typeof window & {
        __TAURI__: { core: { invoke(command: string, args: Record<string, unknown>): Promise<void> } }
      }).__TAURI__.core
      await core.invoke('plugin:window|set_focus', { label: 'quick-capture' })
    })
    const frozen = await browser.execute(async () => {
      const core = (window as typeof window & {
        __TAURI__: { core: { invoke<T>(command: string): Promise<T> } }
      }).__TAURI__.core
      return core.invoke<{ width: number; height: number }>('quick_capture_get_active')
    })
    expect(frozen.width).toBeGreaterThanOrEqual(1280)
    expect(frozen.height).toBeGreaterThanOrEqual(720)
    // Wait for native focus and use X11 geometry: GTK can still resize the
    // WebView after its first decoded frame and initial JS viewport measurement.
    await browser.waitUntil(async () => {
      const focused = (await execute('xdotool', ['getactivewindow'])).stdout.trim()
      return (await execute('xdotool', ['getwindowname', focused])).stdout.includes('Cute Screen Quick Capture')
    })
    const focused = (await execute('xdotool', ['getactivewindow'])).stdout.trim()
    const geometry = (await execute('xdotool', ['getwindowgeometry', '--shell', focused])).stdout
    const native = Object.fromEntries(geometry.trim().split('\n').map((line) => {
      const [key, value] = line.split('=')
      return [key, Number(value)]
    }))
    const bounds = {
      x1: Math.round(native.X! + native.WIDTH! * 0.2),
      y1: Math.round(native.Y! + native.HEIGHT! * 0.2),
      x2: Math.round(native.X! + native.WIDTH! * 0.7),
      y2: Math.round(native.Y! + native.HEIGHT! * 0.7),
    }
    await execute('xdotool', ['mousemove', '--sync', String(bounds.x1), String(bounds.y1), 'mousedown', '1',
      'sleep', '0.2', 'mousemove', '--sync', String(bounds.x2), String(bounds.y2), 'sleep', '0.2', 'mouseup', '1'])
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    const selected = await browser.execute(async () => {
      const core = (window as typeof window & {
        __TAURI__: { core: { invoke<T>(command: string): Promise<T> } }
      }).__TAURI__.core
      return core.invoke<{ selection: { width: number; height: number } }>('quick_capture_get_active')
    })
    expect(selected.selection.width).toBeGreaterThan(200)
    expect(selected.selection.height).toBeGreaterThan(100)
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('[aria-label="Scene canvas"]')).toExist()
    const decoded = await browser.execute(async () => {
      const core = (window as typeof window & {
        __TAURI__: { core: { invoke<T>(command: string, args: Record<string, unknown>): Promise<T> } }
      }).__TAURI__.core
      const opened = await core.invoke<{ imageToken: string }>('repository_open_last', { correlationId: 'activation-decode' })
      const bytes = await core.invoke<ArrayBuffer>('read_image_bytes', { token: opened.imageToken, correlationId: 'activation-decode' })
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
      try {
        const image = new Image()
        image.src = url
        await image.decode()
        return { width: image.naturalWidth, height: image.naturalHeight }
      } finally {
        URL.revokeObjectURL(url)
      }
    })
    expect(decoded.width).toBe(selected.selection.width)
    expect(decoded.height).toBe(selected.selection.height)
    const diagnostics = await browser.execute(async () => {
      const core = (window as typeof window & {
        __TAURI__: { core: { invoke<T>(command: string): Promise<T> } }
      }).__TAURI__.core
      return core.invoke<Array<{ invocationSource: string; terminalOutcome: string }>>('capture_diagnostics')
    })
    expect(diagnostics.some((entry) => entry.invocationSource === 'hotkey' && entry.terminalOutcome === 'captured')).toBe(true)
    await writeFile(path.resolve('artifacts/tauri-e2e/activation-capture-decoded.json'), JSON.stringify({
      platform: process.platform, session: process.env.XDG_SESSION_TYPE,
      frozen, selection: selected.selection, decoded, diagnostics,
    }, null, 2))
  })
})
