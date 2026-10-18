import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'

const execute = promisify(execFile)

async function quickState() {
  return browser.execute(async () => {
    const invoke = (window as typeof window & {
      __TAURI__: { core: { invoke<T>(name: string, args?: Record<string, unknown>): Promise<T> } }
    }).__TAURI__.core.invoke
    return {
      draft: await invoke('quick_capture_get_active'),
      persisted: await invoke('repository_open_last', { correlationId: 'area-escape' }),
      visible: await invoke<boolean>('plugin:window|is_visible', { label: 'quick-capture' }),
      mainVisible: await invoke<boolean>('plugin:window|is_visible', { label: 'main' }),
      escape: document.documentElement.dataset.areaEscape,
    }
  })
}

describe('Area Escape before selection in the real WebView', () => {
  it('cancels without a click and during the first drag, then permits another capture', async function () {
    if (process.platform !== 'linux' || process.env.XDG_SESSION_TYPE !== 'x11') {
      this.skip()
      return
    }
    const evidence = []
    for (const dragging of [false, true]) {
      await $('button[aria-label="Capture"]').click()
      await browser.waitUntil(async () => (await quickState()).draft !== null)
      await browser.tauri.switchWindow('quick-capture')
      await expect($('.cs-quick-capture.is-selecting.is-layout-ready')).toBeDisplayed()
      await expect($('.cs-quick-actions')).not.toExist()
      await browser.execute(() => {
        delete document.documentElement.dataset.areaEscape
        window.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') document.documentElement.dataset.areaEscape = JSON.stringify({
            trusted: event.isTrusted,
            repeat: event.repeat,
            prevented: event.defaultPrevented,
            classes: document.querySelector('.cs-quick-capture')?.className,
            target: (event.target as Element)?.tagName,
          })
        }, { capture: true, once: true })
      })
      if (dragging) {
        await execute('xdotool', ['mousemove', '--sync', '200', '200', 'mousedown', '1',
          'mousemove', '--sync', '700', '500'])
        await expect($('.cs-quick-capture')).toHaveAttribute('class', expect.stringContaining('is-changing-frame'))
      }
      await browser.saveScreenshot(path.resolve(`artifacts/tauri-e2e/area-escape-${dragging ? 'drag' : 'initial'}.png`))
      // Send native input without clicking or explicitly focusing the scene.
      try {
        await execute('xdotool', ['key', 'Escape'])
        await browser.waitUntil(async () => {
          const state = await quickState()
          return state.draft === null && !state.visible && state.mainVisible
        }, { timeoutMsg: 'Initial Escape did not cancel the Area draft and restore main' })
      } finally {
        if (dragging) await execute('xdotool', ['mouseup', '1'])
        evidence.push(await quickState())
        await writeFile(path.resolve('artifacts/tauri-e2e/area-escape.json'), JSON.stringify(evidence, null, 2))
      }
      expect(JSON.parse(evidence.at(-1)!.escape!).trusted).toBe(true)
      await browser.tauri.switchWindow('main')
      await expect($('button[aria-label="Capture"]')).toBeEnabled()
      expect((await quickState()).persisted).toBeNull()
    }
  })
  it('receives native focus from a background CLI capture before any driver window switch', async function () {
    if (process.platform !== 'linux' || process.env.XDG_SESSION_TYPE !== 'x11') {
      this.skip()
      return
    }
    const executable = process.env.CUTE_SCREEN_WDIO_APP_BINARY
    if (!executable) throw new Error('Missing test-harness binary')
    await browser.execute(async () => {
      await window.__cuteScreenE2eWindow?.hide()
    })
    await execute('pnpm', ['smoke:installed:area-escape'], {
      env: { ...process.env, CUTE_SCREEN_AREA_ESCAPE_BINARY: executable },
    })
    await execute(executable, ['show'])
  })

})
