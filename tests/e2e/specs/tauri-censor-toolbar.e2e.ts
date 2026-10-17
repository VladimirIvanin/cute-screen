import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'

import {
  CensorPointerInputUnavailable,
  verifyCensorCreationShape,
} from '../censor-creation-shape'

const evidence = path.resolve('artifacts/censor-toolbar')

async function focusWindow(label: string): Promise<void> {
  await browser.execute(async (windowLabel) => {
    const state = window as typeof window & {
      __TAURI__: { core: { invoke(command: string, args: Record<string, unknown>): Promise<unknown> } }
    }
    await state.__TAURI__.core.invoke('plugin:window|set_focus', { label: windowLabel })
  }, label)
  await browser.waitUntil(() => browser.execute(() => document.hasFocus()))
}

async function verifyToolbar(surface: string): Promise<void> {
  await $('button[aria-label="Hide data"]').click({ button: 'right' })
  await expect($('.cs-censor-toolbar')).toBeDisplayed()
  for (const effect of ['Pixelate', 'Blur', 'Solid fill']) {
    await expect($(`.cs-censor-effect[aria-label="${effect}"]`)).toBeDisplayed()
  }
  await $('.cs-censor-effect[aria-label="Pixelate"]').click()
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
  it('keeps Select accessible after menus in both real webviews', async function () {
    this.timeout(120000)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await focusWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyToolbar('quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await focusWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await verifyToolbar('editor')
  })

  it('chooses shapes only before native drawing in Quick Capture and Editor', async function () {
    this.timeout(120000)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await focusWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    try {
      await verifyCensorCreationShape(path.join(evidence, 'creation-only-native-quick'))
      await $('.cs-quick-actions button:first-child').click()
      await browser.tauri.switchWindow('main')
      await focusWindow('main')
      await expect($('.cs-canvas-ready')).toExist()
      await verifyCensorCreationShape(path.join(evidence, 'creation-only-native-editor'))
    } catch (error) {
      if (error instanceof CensorPointerInputUnavailable) {
        console.warn(error.message)
        this.skip()
      }
      throw error
    }
  })
})
