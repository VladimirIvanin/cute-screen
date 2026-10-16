import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyToolSettings } from '../tool-settings'
import { waitForStableCanvas } from '../canvas-ready'
import { setNumericInput } from '../numeric-input'

describe('tool settings through production capture', () => {
  it('edits pencil spotlight and ruler in Quick and the editor', async function () {
    this.timeout(120000)
    await browser.setWindowSize(1280, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('button[aria-label="Select"]').click()
    await waitForStableCanvas()
    const origin = await $('.cs-canvas:not(.cs-canvas-overlay)').getLocation()
    await browser.action('pointer').move({ origin: 'viewport', x: Math.round(origin.x + 5), y: Math.round(origin.y + 5) }).down({ button: 'left' }).move({ origin: 'pointer', x: 60, y: 50, duration: 180 }).up({ button: 'left' }).perform()
    await browser.waitUntil(() => browser.execute(() => {
      const state = window as typeof window & {
        __cuteScreenE2eQuick?: { snapshot(): { crop: { x: number; y: number } | null } | undefined }
      }
      const crop = state.__cuteScreenE2eQuick?.snapshot()?.crop
      return Boolean(crop && crop.x > 0 && crop.y > 0)
    }))
    await verifyToolSettings('artifacts/tauri-e2e', 'tool-settings-quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await verifyToolSettings('artifacts/tauri-e2e', 'tool-settings-editor')
    await $('.cs-toolrail button[aria-label="Spotlight"]').click({ button: 'right' })
    await $('.cs-tool-configure-popover-host button[aria-label="Dimming"]').click()
    await setNumericInput($('[role="dialog"] input[aria-label="Dimming"]'), '80')
    await browser.keys('Enter')
    await browser.keys('Escape')
    await browser.keys('Escape')
    await $('.cs-toolrail button[aria-label="Ruler"]').click({ button: 'right' })
    await $('.cs-tool-configure-popover-host button[aria-label="Measurement and snapping"]').click()
    await setNumericInput($('[role="dialog"] input[aria-label="Angle step"]'), '30')
    await browser.keys('Enter')
    await browser.keys('Escape')
    await browser.keys('Escape')
    await expect($('.cs-save-status')).not.toExist()
  })
})
