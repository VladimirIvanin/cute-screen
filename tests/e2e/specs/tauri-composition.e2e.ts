import {
  writeFile,
  readFile,
  copyFile,
} from 'node:fs/promises'
import { loadImage } from '@napi-rs/canvas'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  cardDocument,
  cardNative,
} from '../publication-card'
import { nativeImageIngress } from '../image-ingress'
import { waitForStableCanvas } from '../canvas-ready'
import { verifyAppearanceGradientDrag } from '../appearance-gradient'

describe('native publication card', () => {
  it('saves durable materials, copies full pixels and persists a manually applied style', async () => {
    await browser.setWindowSize(1280, 900)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await waitForStableCanvas()
    await expect($('button[aria-label="Appearance"]')).not.toExist()
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    expect((await cardDocument()).presentation.composition).toBeUndefined()
    await nativeImageIngress('picker')
    await $('button[aria-label="Open image"]').click()
    await browser.waitUntil(async () => (await cardDocument()).canvas.width === 3840)
    await waitForStableCanvas()
    await $('button[aria-label="Appearance"]').waitForEnabled()
    await $('button[aria-label="Appearance"]').click()
    const panel = $('.cs-composition-panel')
    await panel.$('button=Browser').click()
    await panel.$('summary=Frame').click()
    await panel.$('label*=Title').$('input').setValue('Длинный заголовок · Cute Screen — публикационная карточка')
    await browser.keys('Tab')
    await verifyAutomaticCardArrow()
    await verifyAppearanceGradientDrag(async () =>
      (await cardDocument()).presentation.composition!.background.linear.stops)
    await panel.$('[data-card-fill="image"]').click()
    await nativeImageIngress('picker', 'alpha.png')
    await panel.$('button=Import image').click()
    await browser.waitUntil(async () => (await cardDocument()).presentation.composition?.background.image !== null)
    const resources = await cardNative<Array<{ id: string; kind: string }>>('materials_list')
    expect(resources.some((item) => item.kind === 'background')).toBe(true)
    await panel.$('label*=Preset name').$('input').setValue('Cute publication')
    await panel.$('button=Save style').click()
    await browser.waitUntil(async () => (await cardNative<Array<{ kind: string }>>('materials_list')).some((item) => item.kind === 'preset'))
    await panel.$('[data-card-fill="freeform"]').click()
    await browser.waitUntil(async () => (await cardDocument()).presentation.composition?.background.kind === 'freeform')
    await waitForStableCanvas()
    await $('button[aria-label="Copy"]').click()
    await expect($('.cs-action-feedback.is-success')).toHaveText('Result copied', { wait: 90000 })
    const bitmap = await cardNative<{ bitmap: { width: number; height: number } }>('clipboard_read_snapshot', { correlationId: 'composition-copy' })
    await $('button[aria-label="Undo"]').click()
    await browser.waitUntil(async () => (await cardDocument()).presentation.composition?.background.kind === 'image')
    const document = await cardDocument()
    expect(bitmap.bitmap.width).toBeGreaterThan(document.canvas.width)
    expect(bitmap.bitmap.height).toBeGreaterThan(document.canvas.height)
    const output = await cardNative<string>('test_result_export', { cancel: false })
    await $('button[aria-label="Export"]').click()
    await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('PNG exported'), { wait: 90000 })
    const decoded = await loadImage(await readFile(output))
    expect([decoded.width, decoded.height]).toEqual([bitmap.bitmap.width, bitmap.bitmap.height])
    await copyFile(output, 'artifacts/tauri-e2e/composition-export.png')
    // Removing the catalogue row cannot release a blob still owned by the document and preset.
    await cardNative('materials_remove', { id: resources.find((item) => item.kind === 'background')!.id })
    await browser.waitUntil(() => browser.execute(() => !globalThis.document.querySelector('.cs-save-status')))
    await writeFile('artifacts/tauri-e2e/composition-document.json', JSON.stringify(document, null, 2))
    await browser.saveScreenshot('artifacts/tauri-e2e/composition-editor.png')
  }).timeout(180000)
})

async function verifyAutomaticCardArrow(): Promise<void> {
  await expect($('button=On card')).not.toExist()
  await $('.cs-toolrail [data-tool-id="arrow"]').click()
  await $('.cs-zoom-fit').click()
  await waitForStableCanvas()
  const canvas = await browser.execute(() =>
    document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
  const count = (await cardDocument()).layers.length
  const x = Math.round(canvas.left + canvas.width * 0.025)
  const y = Math.round(canvas.top + canvas.height * 0.5)
  await browser.action('pointer').move({ origin: 'viewport', x, y }).down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(canvas.left + canvas.width * 0.45), y, duration: 150 })
    .up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await cardDocument()).layers.length === count + 1)
  expect((await cardDocument()).layers.at(-1)?.space).toBe('card')
}
