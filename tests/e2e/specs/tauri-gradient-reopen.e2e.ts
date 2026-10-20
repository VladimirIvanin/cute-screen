import { readFile } from 'node:fs/promises'
import {
  $,
  $$,
  browser,
  expect,
} from '@wdio/globals'
import {
  gradientDocument,
  type GradientSnapshot,
} from '../gradient'
import { waitForStableCanvas } from '../canvas-ready'

describe('gradient after native relaunch', () => {
  it('restores the specialized tool identity, editable controls and independent defaults', async () => {
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    const saved = JSON.parse(await readFile('artifacts/tauri-e2e/gradient-document.json', 'utf8')) as GradientSnapshot
    const previous = saved.layers.find((layer) => layer.payload.annotationTool === 'gradient')!
    const restored = (await gradientDocument()).layers.find((layer) => layer.id === previous.id)!
    expect(restored.payload).toEqual(previous.payload)
    await $('.cs-toolrail [data-tool-id="select"]').click()
    const rect = await browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
    const restoredDocument = await gradientDocument()
    const frame = restoredDocument.crop ?? { x: 0, y: 0, ...restoredDocument.canvas }
    const centerY = restored.transform.translateY + restored.localBounds.height / 2
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(rect.left + rect.width * .25),
        y: Math.round(rect.top + (centerY - frame.y) / frame.height * rect.height) })
      .down({ button: 'left' }).up({ button: 'left' }).perform()
    const toolbar = $('.cs-selection-floating-toolbar .cs-gradient-toolbar')
    await expect(toolbar).toBeDisplayed()
    const current = async () => (await gradientDocument()).layers.find((layer) => layer.id === previous.id)!
    await toolbar.$('button=Full height').click()
    await browser.waitUntil(async () => (await current()).localBounds.height === frame.height)
    await browser.keys(['Control', 'z'])
    await browser.waitUntil(async () => (await current()).localBounds.height === previous.localBounds.height)
    expect((await current()).localBounds).toEqual(previous.localBounds)
    await browser.saveScreenshot('artifacts/tauri-e2e/gradient-reopened.png')
    await $('.cs-toolrail [data-tool-id="gradient"]').click()
    await $('.cs-tool-defaults-toolbar button[aria-label="Gradient settings"]').click()
    expect(await $$('[data-gradient-stop]').length).toBe(3)
    await browser.keys('Escape')
  }).timeout(120000)
})
