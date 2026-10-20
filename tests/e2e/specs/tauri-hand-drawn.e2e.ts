import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyHandDrawn } from '../hand-drawn'
import { shapeDocument } from '../shape-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

describe('hand-drawn annotations through native capture', () => {
  it('creates in Quick and retains editable geometry after Editor handoff', async () => {
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
    await verifyHandDrawn('artifacts/tauri-e2e')
    const before = (await shapeDocument()).layers.slice(-3).map((layer) => layer.payload)
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    expect((await shapeDocument()).layers.slice(-3).map((layer) => layer.payload)).toEqual(before)
    await expect($('.cs-save-status')).not.toExist()
    await browser.saveScreenshot('artifacts/tauri-e2e/hand-drawn-editor.png')
  }).timeout(180000)
})
