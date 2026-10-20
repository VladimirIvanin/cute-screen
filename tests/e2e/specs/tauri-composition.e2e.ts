import {
  writeFile,
  readFile,
  copyFile,
} from 'node:fs/promises'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import { resolveCompositionLayout } from '../../../packages/editor-core/src/composition/layout'
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
import { setNumericInput } from '../numeric-input'
import { verifyFrameTypes } from '../frame-types'
import { verifyInsetSlider } from '../inset-slider'
import { verifyBackgroundThumbnail } from '../background-thumbnail'
import { verifyShadowPresetPreviews } from '../shadow-preset-previews'
import { verifyRemoveAppearance } from '../remove-appearance'
import {
  verifyAppearanceColors,
  verifyEyedropperButton,
} from '../appearance-colors'

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
    await browser.execute(() => {
      const state = window as typeof window & {
        __appearanceInput?: Array<{ type: string; key: string; trusted: boolean }>
      }
      state.__appearanceInput = []
      for (const type of ['pointerdown', 'keydown', 'contextmenu']) window.document.addEventListener(type, (event) => {
        state.__appearanceInput!.push({
          type, key: event instanceof KeyboardEvent ? event.key : '', trusted: event.isTrusted,
        })
      }, true)
    })
    await $('button[aria-label="Appearance"]').click()
    const panel = $('.cs-composition-panel')
    await expect(panel.$('summary=Background & layout')).toBeDisplayed()
    expect((await cardDocument()).presentation.composition).toBeUndefined()
    await panel.$('.cs-card-inset-units').$('button=px').click()
    expect((await cardDocument()).presentation.composition?.layout.insets.unit).toBe('px')
    await $('button[aria-label="Undo"]').click()
    expect((await cardDocument()).presentation.composition).toBeUndefined()
    await expect(panel.$('.cs-card-inset-units').$('button=%')).toHaveAttribute('aria-pressed', 'true')
    await panel.$('input[aria-label="All sides"]').setValue('6')
    await browser.keys('Tab')
    await browser.waitUntil(async () => (await cardDocument()).presentation.composition?.layout.insets.top === 6)
    expect((await cardDocument()).presentation.composition?.shadow).toBe(0)
    await $('button[aria-label="Undo"]').click()
    await browser.waitUntil(async () => (await cardDocument()).presentation.composition === undefined)
    await expect(panel.$('summary=Background & layout')).toBeDisplayed()
    await panel.$('[data-card-fill="solid"]').click()
    await verifyAppearanceColors(cardDocument, 'artifacts/tauri-e2e')
    await verifyEyedropperButton('artifacts/tauri-e2e')
    await panel.$('button=Medium').click()
    expect((await cardDocument()).presentation.composition?.shadow).toBe(0.45)
    await verifyInsetSlider(async () => (await cardDocument()).presentation.composition, 'artifacts/tauri-e2e')
    const shadow = panel.$('input[aria-label="Shadow strength"]')
    await setNumericInput(shadow, '72')
    expect((await cardDocument()).presentation.composition?.shadow).toBe(0.45)
    await browser.keys('Escape')
    await expect(panel).toBeDisplayed()
    await expect(shadow).toHaveValue('45')
    await setNumericInput(shadow, '63')
    await browser.keys('Enter')
    expect((await cardDocument()).presentation.composition?.shadow).toBe(0.63)
    await $('button[aria-label="Undo"]').click()
    expect((await cardDocument()).presentation.composition?.shadow).toBe(0.45)
    await $('button[aria-label="Redo"]').click()
    expect((await cardDocument()).presentation.composition?.shadow).toBe(0.63)
    const size = panel.$('input[aria-label="Shadow size"]')
    await setNumericInput(size, '400')
    await browser.keys('Escape')
    await expect(size).toHaveValue('100')
    await setNumericInput(size, '400')
    await browser.keys('Enter')
    expect((await cardDocument()).presentation.composition?.shadowOptions?.size).toBe(4)
    await $('button[aria-label="Undo"]').click()
    await expect(size).toHaveValue('100')
    await $('button[aria-label="Redo"]').click()
    await expect(size).toHaveValue('400')
    await verifyConnectedShadow()
    await verifyShadowPresetPreviews('artifacts/tauri-e2e/shadow-presets-native')
    const inputTrace = await browser.execute(() => (window as typeof window & {
      __appearanceInput: Array<{ type: string; key: string; trusted: boolean }>
    }).__appearanceInput)
    expect(inputTrace.some((event) => event.key === 'Escape')).toBe(true)
    expect(inputTrace.every((event) => event.trusted)).toBe(true)
    await writeFile('artifacts/tauri-e2e/appearance-input.json', JSON.stringify(inputTrace, null, 2))
    await browser.saveScreenshot('artifacts/tauri-e2e/appearance-compact.png')
    await panel.$('button=Browser').click()
    await verifyFrameTypes(async () => (await cardDocument()).presentation.composition, 'artifacts/tauri-e2e')
    const frameInput = await browser.execute(() => (window as typeof window & {
      __appearanceInput: Array<{ type: string; key: string; trusted: boolean }>
    }).__appearanceInput.filter((event) => event.key === 'ArrowRight'))
    expect(frameInput.length).toBeGreaterThanOrEqual(2)
    expect(frameInput.every((event) => event.trusted)).toBe(true)
    await writeFile('artifacts/tauri-e2e/frame-input.json', JSON.stringify(frameInput, null, 2))
    await panel.$('label*=Title').$('input').setValue('Длинный заголовок · Cute Screen — публикационная карточка')
    await browser.keys('Tab')
    await verifyAutomaticCardArrow()
    await verifyRemoveAppearance(cardDocument, 'artifacts/tauri-e2e', async () => {
      const document = await cardDocument()
      const output = await cardNative<string>('test_result_export', { cancel: false })
      await $('button[aria-label="Export"]').click()
      await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('PNG exported'), { wait: 90000 })
      const image = await loadImage(await readFile(output))
      const source = document.crop ?? document.canvas
      expect([image.width, image.height]).toEqual([source.width, source.height])
      await copyFile(output, 'artifacts/tauri-e2e/composition-no-appearance.png')
    })
    await verifyAppearanceGradientDrag(async () =>
      (await cardDocument()).presentation.composition!.background.linear.stops)
    await panel.$('[data-card-fill="image"]').click()
    await nativeImageIngress('picker', 'ui-4k.png')
    await panel.$('button=Import image').click()
    await browser.waitUntil(async () => (await cardDocument()).presentation.composition?.background.image !== null)
    await verifyBackgroundThumbnail(3840, 2160, 'artifacts/tauri-e2e')
    await nativeImageIngress('picker', 'alpha.png')
    await panel.$('button=Replace image').click()
    await browser.waitUntil(async () => (await cardDocument()).presentation.composition?.background.image?.width === 64)
    await verifyBackgroundThumbnail(64, 64, 'artifacts/tauri-e2e')
    await $('button[aria-label="Undo"]').click()
    await verifyBackgroundThumbnail(3840, 2160, 'artifacts/tauri-e2e')
    await $('button[aria-label="Redo"]').click()
    await verifyBackgroundThumbnail(64, 64, 'artifacts/tauri-e2e')
    const beforeCancel = (await cardDocument()).presentation.composition
    await nativeImageIngress('cancel')
    await panel.$('button=Replace image').click()
    await expect(panel.$('button=Replace image')).toBeEnabled()
    expect((await cardDocument()).presentation.composition).toEqual(beforeCancel)
    await verifyBackgroundThumbnail(64, 64, 'artifacts/tauri-e2e')
    const resources = await cardNative<Array<{ id: string; kind: string }>>('materials_list')
    expect(resources.some((item) => item.kind === 'background')).toBe(true)
    await panel.$('summary=Presets').click()
    await setNumericInput(size, '250')
    await browser.keys('Enter')
    expect((await cardDocument()).presentation.composition?.shadowOptions?.size).toBe(2.5)
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
    for (const resource of resources.filter((item) => item.kind === 'background')) {
      await cardNative('materials_remove', { id: resource.id })
    }
    await browser.waitUntil(() => browser.execute(() => !globalThis.document.querySelector('.cs-save-status')))
    await writeFile('artifacts/tauri-e2e/composition-document.json', JSON.stringify(document, null, 2))
    await browser.saveScreenshot('artifacts/tauri-e2e/composition-editor.png')
  }).timeout(180000)
})

async function verifyConnectedShadow(): Promise<void> {
  const panel = $('.cs-composition-panel')
  for (const [label, value] of [['All sides', '8'], ['Scale %', '99'], ['Corners', '38']] as const) {
    await setNumericInput(panel.$(`input[aria-label="${label}"]`), value)
    await browser.keys('Tab')
  }
  await setNumericInput(panel.$('input[aria-label="Shadow strength"]'), '83')
  await browser.keys('Enter')
  const document = await cardDocument()
  const layout = resolveCompositionLayout(document)
  const output = await cardNative<string>('test_result_export', { cancel: false })
  await $('button[aria-label="Export"]').click()
  await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('PNG exported'), { wait: 90000 })
  const decoded = await loadImage(await readFile(output))
  const canvas = createCanvas(decoded.width, decoded.height)
  const context = canvas.getContext('2d')
  context.drawImage(decoded, 0, 0)
  const x = Math.round(layout.frame.x + layout.frame.width / 2)
  const y = Math.ceil(layout.frame.y + layout.frame.height + 1)
  const red = context.getImageData(x, y, 1, 1).data[0]!
  const background = Math.round(document.presentation.composition!.background.color.red * 255)
  expect(red).toBeLessThan(background - 8)
  await writeFile('artifacts/tauri-e2e/appearance-shadow-pixel.json', JSON.stringify({ x, y, red, background,
    width: decoded.width, height: decoded.height, scale: 0.99, radius: 38, shadow: 0.83,
    shadowSize: document.presentation.composition!.shadowOptions?.size }, null, 2))
  await browser.saveScreenshot('artifacts/tauri-e2e/appearance-shadow-native.png')
}

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
