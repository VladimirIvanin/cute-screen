import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'

const evidence = path.resolve('artifacts/censor-toolbar')

async function verifyToolbar(surface: string): Promise<void> {
  await $('button[aria-label="Hide data"]').click({ button: 'right' })
  await expect($('.cs-censor-toolbar')).toBeDisplayed()
  for (const effect of ['Pixelate', 'Blur', 'Solid fill']) {
    await expect($(`.cs-censor-effect[aria-label="${effect}"]`)).toBeDisplayed()
  }
  await $('.cs-censor-parameter').click()
  await expect($('.cs-censor-popover')).toBeDisplayed()
  await $('.cs-censor-popover button[aria-label="24 px"]').click()
  await browser.keys('Escape')
  await expect($('.cs-censor-parameter')).toHaveText('Pixels: 24 px')
  await $('.cs-censor-region').click()
  await expect($('.cs-censor-popover button[aria-label="Freeform outline"]')).toBeDisplayed()
  await browser.keys('Escape')
  await browser.saveScreenshot(path.join(evidence, `native-${surface}.png`))
  // Regression: the old censor fieldset intercepted this physical click in Quick.
  await $('button[aria-label="Select"]').click()
  await expect($('button[aria-label="Select"]')).toHaveAttribute('aria-pressed', 'true')
}

describe('censor toolbar through production Capture → Quick → Editor', () => {
  before(async () => {
    await mkdir(evidence, { recursive: true })
    await browser.setWindowSize(1024, 750)
  })
  it('keeps Select accessible after menus in both real webviews', async () => {
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyToolbar('quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await verifyToolbar('editor')
  })
})
