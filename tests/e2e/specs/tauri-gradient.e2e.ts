import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  verifyGradient,
} from '../gradient'
import { waitForStableCanvas } from '../canvas-ready'

describe('gradient in the native full Editor', () => {
  it('excludes Gradient from Quick and creates it after Editor handoff', async () => {
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
    await expect($('.cs-toolrail [data-tool-id="gradient"]')).not.toExist()
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await verifyGradient('artifacts/tauri-e2e')
    await expect($('.cs-save-status')).not.toExist()
  }).timeout(180000)
})
