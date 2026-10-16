import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'
import { verifyToolLifecycle } from '../tool-lifecycle'
import { waitForStableCanvas } from '../canvas-ready'

const output = path.resolve('artifacts/tool-lifecycle')
async function keyboardConfigure(surface: string): Promise<void> {
  const arrow = $('button[aria-label="Arrow"]')
  await arrow.click()
  await expect(arrow).toHaveAttribute('aria-pressed', 'true')
  await arrow.click()
  await expect(arrow).toBeFocused()
  await browser.keys([Key.Shift, Key.F10])
  await expect($('.cs-tool-configure-popover-host')).toBeDisplayed()
  await browser.keys('Escape')
  await expect($('.cs-tool-configure-popover-host')).not.toExist()
  await expect(arrow).toBeFocused()
  await browser.keys([Key.Shift, Key.F10])
  await expect($('.cs-tool-configure-popover-host')).toBeDisplayed()
  await browser.keys('p')
  await expect($('.cs-tool-configure-popover-host')).not.toExist()
  await expect($('button[aria-label="Pencil"]')).toHaveAttribute('aria-pressed', 'true')
  await expect($('.cs-tool-defaults-toolbar')).not.toExist()
  await browser.saveScreenshot(path.join(output, `native-${surface}-keyboard.png`))
}
describe('tool lifecycle through production Capture → Quick → Editor', () => {
  it('uses the keyboard configure and transition contract in both real WebViews', async function () {
    this.timeout(120000)
    await mkdir(output, { recursive: true })
    await browser.setWindowSize(1280, 800)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('button[aria-label="Select"]').click()
    await waitForStableCanvas()
    await keyboardConfigure('quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await keyboardConfigure('editor')
  })
  it('creates and dismisses a selection with native context-menu and pointer input', async () => {
    await verifyToolLifecycle(output, 'native-editor')
  })
})
