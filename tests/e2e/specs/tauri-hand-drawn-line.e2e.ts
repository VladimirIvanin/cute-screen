import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyHandDrawnLine } from '../hand-drawn-line'
import { lineDocument } from '../line'
import { waitForStableCanvas } from '../canvas-ready'

describe('hand-drawn line in the native editor', () => {
  it('creates in Quick and preserves both lines through Editor handoff', async () => {
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
    await verifyHandDrawnLine('artifacts/tauri-e2e')
    const before = (await lineDocument()).layers.slice(-2)
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    expect((await lineDocument()).layers.slice(-2)).toEqual(before)
    await expect($('.cs-save-status')).not.toExist()
    await browser.saveScreenshot('artifacts/tauri-e2e/hand-drawn-line-editor.png')
  }).timeout(180000)
})
