import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyShapePaint } from '../shape-paint'
import { shapeDocument } from '../shape-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

describe('shape paint in a real WebView', () => {
  it('edits in cropped Quick, preserves the paint on handoff and creates the next shape from defaults', async () => {
    await browser.setWindowSize(1024, 800)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await waitForStableCanvas()
    await browser.execute(async () => {
      const native = window as unknown as {
        __TAURI__: { core: { invoke(command: string, args: unknown): Promise<void> } }
      }
      await native.__TAURI__.core.invoke('plugin:window|set_focus', { label: 'quick-capture' })
    })
    await browser.execute(() => {
      const state = window as typeof window & { __shapePaintTrusted?: boolean[] }
      state.__shapePaintTrusted = []
      document.addEventListener('pointerdown', (event) => state.__shapePaintTrusted!.push(event.isTrusted), true)
    })
    const rect = await browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
    await browser.action('pointer').move({ origin: 'viewport', x: Math.round(rect.left + 1), y: Math.round(rect.top + 1) })
      .down({ button: 'left' }).move({ origin: 'pointer', x: Math.round(rect.width * 0.1), y: Math.round(rect.height * 0.1), duration: 200 }).up({ button: 'left' }).perform()
    await verifyShapePaint('artifacts/tauri-e2e/shape-paint-quick')
    const quick = await browser.execute(() => {
      const state = window as typeof window & {
        __shapePaintTrusted: boolean[]
        __cuteScreenE2eQuick: { snapshot(): { crop: { x: number; y: number } } }
      }
      return { crop: state.__cuteScreenE2eQuick.snapshot().crop, trusted: state.__shapePaintTrusted }
    })
    expect(quick.crop.x).toBeGreaterThan(0)
    expect(quick.crop.y).toBeGreaterThan(0)
    expect(quick.trusted.length).toBeGreaterThan(0)
    expect(quick.trusted.every(Boolean)).toBe(true)
    const before = (await shapeDocument()).layers.at(-1)!.payload
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    expect((await shapeDocument()).layers.at(-1)!.payload).toEqual(before)
    await verifyShapePaint('artifacts/tauri-e2e/shape-paint-editor')
    await $('button[aria-label="Copy"]').click()
    await expect($('.cs-action-feedback.is-success')).toHaveText('Result copied')
    const exported = await browser.execute(async () => {
      const state = window as unknown as {
        __TAURI__: { core: {
          invoke(command: string, args: unknown): Promise<{ bitmap: { width: number; height: number } }>
        } }
      }
      const result = await state.__TAURI__.core.invoke('clipboard_read_snapshot', { correlationId: 'shape-paint-export' })
      return result.bitmap
    })
    expect(exported.width).toBeGreaterThan(0)
    expect(exported.height).toBeGreaterThan(0)
    await expect($('.cs-save-status')).not.toExist()
  }).timeout(180000)
})
