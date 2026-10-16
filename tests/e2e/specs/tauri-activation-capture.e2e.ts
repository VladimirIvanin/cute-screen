import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'

const execute = promisify(execFile)

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
    await browser.waitUntil(async () => !(await browser.tauri.listWindows()).includes('settings'))
    await browser.tauri.switchWindow('main')
    await browser.execute(async () => {
      await window.__cuteScreenE2eWindow?.hide()
    })
    await execute('xdotool', ['key', '--clearmodifiers', 'ctrl+alt+shift+8'])
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
    } catch (cause) {
      const diagnostics = await browser.execute(async () => {
        const core = (window as typeof window & {
          __TAURI__: { core: { invoke(command: string): Promise<unknown> } }
        }).__TAURI__.core
        return { draft: await core.invoke('quick_capture_get_active'), diagnostics: await core.invoke('capture_diagnostics'), text: document.body.innerText }
      })
      throw new Error(`Global capture did not present: ${JSON.stringify(diagnostics)}`, { cause })
    }
    const bounds = await browser.execute(() => ({
      x1: Math.round(screenX + innerWidth * 0.2), y1: Math.round(screenY + innerHeight * 0.2),
      x2: Math.round(screenX + innerWidth * 0.7), y2: Math.round(screenY + innerHeight * 0.7),
    }))
    await execute('xdotool', ['mousemove', '--sync', String(bounds.x1), String(bounds.y1), 'mousedown', '1',
      'sleep', '0.15', 'mousemove', '--sync', String(bounds.x2), String(bounds.y2), 'sleep', '0.15', 'mouseup', '1'])
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
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
    expect(decoded.width).toBeGreaterThanOrEqual(800)
    expect(decoded.height).toBeGreaterThanOrEqual(600)
  })
})
