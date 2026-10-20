import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { waitForStableCanvas } from '../canvas-ready'
import { verifyNumericKeyboard } from '../numeric-keyboard'
import { verifyNumericAppearance } from '../numeric-appearance'

describe('numeric keyboard through production capture', () => {
  it('previews, commits and cancels in Quick and Editor through trusted input', async () => {
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
    await verifyNumericKeyboard('artifacts/tauri-e2e', 'shape', 'numeric-quick')
    await browser.keys('Escape')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await verifyNumericKeyboard('artifacts/tauri-e2e', 'gradient', 'numeric-editor')
    await verifyNumericAppearance('artifacts/tauri-e2e')
    await expect($('.cs-save-status')).not.toExist()
  }).timeout(120000)
})
