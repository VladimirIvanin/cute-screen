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

interface NativeDrag {
  case: string
  width: number
  height: number
  start: [number, number]
  end: [number, number]
  hwnd: number
}

describe('Windows Area physical mouse at screen boundaries', () => {
  it('starts on every edge and corner, completes across the screen and cancels a live drag', async () => {
    if (process.platform !== 'win32' || process.env.CUTE_SCREEN_E2E_FAKE_CAPTURE) {
      throw new Error('Requires physical Windows capture and system mouse input')
    }
    const executable = process.env.CUTE_SCREEN_WDIO_APP_BINARY!
    const evidence = []
    for (const name of ['top', 'left', 'right', 'bottom', 'top-left', 'top-right', 'bottom-left',
      'bottom-right', 'full', 'cancel-drag', 'inside']) {
      await execute(executable, ['show'])
      await browser.tauri.switchWindow('main')
      await expect($('button[aria-label="Capture"]')).toBeEnabled()
      await $('button[aria-label="Capture"]').click()
      await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
      await browser.tauri.switchWindow('quick-capture')
      await expect($('.cs-quick-capture.is-selecting.is-layout-ready')).toBeDisplayed()
      await browser.execute(() => {
        document.documentElement.dataset.edgePointer = ''
        document.addEventListener('pointerdown', (event) => {
          const pointer = event as PointerEvent
          document.documentElement.dataset.edgePointer = JSON.stringify({
            x: pointer.clientX, y: pointer.clientY, trusted: event.isTrusted,
          })
        }, { capture: true, once: true })
      })
      const output = await execute('powershell.exe', ['-NoProfile', '-File',
        path.resolve('tests/e2e/fixtures/windows-area-pointer.ps1'), '-AppExecutable', executable, '-Case', name],
      { windowsHide: true })
      const input = JSON.parse(output.stdout.trim()) as NativeDrag
      const pointer = await $('html').getAttribute('data-edge-pointer')
      evidence.push({ input, pointer })
      await writeFile('artifacts/tauri-e2e/windows-area-edges.json', JSON.stringify(evidence, null, 2))
      if (!pointer) throw new Error(`System pointerdown missing at ${name}`)
      expect(JSON.parse(pointer!).trusted).toBe(true)
      if (name === 'cancel-drag') {
        await expect($('.cs-quick-capture.is-layout-ready')).not.toExist()
        continue
      }
      await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
      const selection = await browser.execute(async () => {
        const invoke = (window as typeof window & {
          __TAURI__: { core: { invoke<T>(name: string): Promise<T> } }
        }).__TAURI__.core.invoke
        return (await invoke<{ selection: { x: number; y: number; width: number; height: number } }>(
          'quick_capture_get_active')).selection
      })
      // Physical cursor positions address pixel centres; the last position is width - 1.
      expect(selection.x).toBe(Math.min(input.start[0], input.end[0]))
      expect(selection.y).toBe(Math.min(input.start[1], input.end[1]))
      expect(selection.width).toBe(Math.abs(input.end[0] - input.start[0]))
      expect(selection.height).toBe(Math.abs(input.end[1] - input.start[1]))
      await browser.saveScreenshot(`artifacts/tauri-e2e/windows-area-${name}.png`)
      await $('.cs-quick-actions button:last-child').click()
    }
    await browser.tauri.switchWindow('main')
    const last = await browser.execute(async () => {
      const invoke = (window as typeof window & {
        __TAURI__: { core: { invoke<T>(name: string, args: unknown): Promise<T> } }
      }).__TAURI__.core.invoke
      return invoke('repository_open_last', { correlationId: 'edges-no-document' })
    })
    expect(last).toBeNull()
  })
})
