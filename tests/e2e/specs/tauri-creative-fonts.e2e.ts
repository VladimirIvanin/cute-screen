import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import { nativeImageIngress } from '../image-ingress'
import { waitForStableCanvas } from '../canvas-ready'
import { cardDocument } from '../publication-card'
import {
  CREATIVE_FONT_FAMILIES,
  CREATIVE_FONT_TEXT,
  verifyCreativeFontExport,
  verifyCreativeFontLayers,
} from '../creative-fonts'
import {
  setTextFont,
} from './browser-v7-rich-text-test-kit'

describe('creative Cyrillic fonts in the production WebView', () => {
  it('creates eight wrapped B/I samples through the menu and persists a decoded 4K export', async () => {
    await browser.setWindowSize(1440, 900)
    await nativeImageIngress('picker')
    await $('button[aria-label="Open image"]').click()
    await $('button[aria-label="Export"]').waitForEnabled()
    await waitForStableCanvas()
    const initial = (await cardDocument()).layers.length
    for (const [index, family] of CREATIVE_FONT_FAMILIES.entries()) {
      console.info('Native font roundtrip:', family)
      await $('button[aria-label="Text"]').click()
      await waitForStableCanvas()
      const point = await browser.execute((index) => {
        const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
        return { x: Math.round(rect.left + rect.width * (index % 2 ? .58 : .08)),
          y: Math.round(rect.top + rect.height * (.08 + Math.floor(index / 2) * .22)) }
      }, index)
      await browser.action('pointer').move({ origin: 'viewport', ...point })
        .down({ button: 'left' }).up({ button: 'left' }).perform()
      const editor = $('[contenteditable="true"][aria-label="Text editor"]')
      await expect(editor).toExist()
      await editor.addValue(CREATIVE_FONT_TEXT)
      await browser.keys(['Control', 'a'])
      await setTextFont(family)
      const size = $('button[aria-label="Font size"]')
      if ((await size.getText()).trim() !== '48') {
        await size.click()
        await browser.waitUntil(() => browser.execute(() =>
          document.getAnimations().every((animation) => animation.playState !== 'running')))
        await $('.cs-text-size-popover button[aria-label="48 px"]').click()
        await size.click()
      }
      for (const label of ['Bold', 'Italic']) {
        const button = $(`button[aria-label="${label}"]`)
        if (await button.getAttribute('aria-pressed') !== 'true') await button.click()
      }
      await browser.execute(() => document.querySelector<HTMLElement>('[contenteditable="true"]')!.focus())
      await browser.keys(['Control', 'Enter'])
      await browser.waitUntil(async () => (await cardDocument()).layers.length === initial + index + 1)
      const created = (await cardDocument()).layers.at(-1)!
      await $('button[aria-label="Undo"]').click()
      await browser.waitUntil(async () => (await cardDocument()).layers.length === initial + index)
      await $('button[aria-label="Redo"]').click()
      await browser.waitUntil(async () => (await cardDocument()).layers.length === initial + index + 1)
      expect((await cardDocument()).layers.at(-1)).toEqual(created)
    }
    await verifyCreativeFontLayers()
    await $('button[aria-label="Select"]').click()
    const hash = await verifyCreativeFontExport('creative-fonts-export')
    await expect($('.cs-save-status')).not.toExist()
    await writeFile('artifacts/tauri-e2e/creative-fonts-document.json', JSON.stringify(await cardDocument(), null, 2))
    await writeFile('artifacts/tauri-e2e/creative-fonts-export-sha256.txt', hash)
    await $('.cs-zoom-fit').click()
    await waitForStableCanvas()
    await browser.saveScreenshot('artifacts/tauri-e2e/creative-fonts-editor.png')
  }).timeout(240000)
})
