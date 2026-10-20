import { writeFile } from 'node:fs/promises'
import { Key } from 'webdriverio'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'
import { waitForStableCanvas } from './canvas-ready'
import { setNumericInput } from './numeric-input'

export async function numericSceneChecksum(): Promise<number> {
  return browser.execute(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const encoded = canvas.toDataURL()
    let hash = 2166136261
    for (let i = 0; i < encoded.length; i++) hash = Math.imul(hash ^ encoded.charCodeAt(i), 16777619)
    return hash >>> 0
  })
}

/** Real UI creation and trusted keyboard input, shared by browser and WebView2. */
export async function verifyNumericKeyboard(
  directory: string,
  tool: 'gradient' | 'shape' = 'gradient',
  prefix = 'numeric-keyboard',
  locale: 'en' | 'ru' = 'en',
): Promise<void> {
  await browser.releaseActions()
  await $(`.cs-toolrail [data-tool-id="${tool}"]`).click()
  await browser.action('pointer').move({ origin: 'viewport', x: 5, y: 5 }).perform()
  await waitForShapeAnimation()
  await waitForStableCanvas()
  const rect = await browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
  const count = (await shapeDocument()).layers.length
  // Handoff preserves the Quick shape; start a new gradient away from its corner handles.
  const area = tool === 'shape' ? { x: 0.3, y: 0.35, endX: 0.65, endY: 0.6 }
    : { x: 0.1, y: 0.1, endX: 0.45, endY: 0.25 }
  await browser.action('pointer')
    .move({ origin: 'viewport', x: Math.round(rect.left + rect.width * area.x), y: Math.round(rect.top + rect.height * area.y) })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(rect.left + rect.width * area.endX), y: Math.round(rect.top + rect.height * area.endY), duration: 160 })
    .up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === count + 1)
  if (tool === 'shape') await $('.cs-selection-floating-toolbar [data-shape-control="appearance"]').click()
  const surface = tool === 'gradient' ? '.cs-selection-floating-toolbar .cs-gradient-toolbar' : '.cs-shape-popover'
  const opacity = locale === 'ru' ? 'Непрозрачность' : 'Opacity'
  const input = $(tool === 'gradient' ? `${surface} .cs-gradient-opacity input` : `${surface} input[aria-label="${opacity}"]`)
  await expect(input).toBeDisplayed()
  await setNumericInput(input, '80')
  await browser.keys('Enter')
  await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)!.opacity === 0.8)
  const baseline = await shapeDocument()
  const originalPixels = await numericSceneChecksum()
  await browser.execute(() => {
    const trace: { key: string; trusted: boolean }[] = []
    const controller = new AbortController()
    const state = window as typeof window & { __numericKeyboard?: { trace: typeof trace; controller: AbortController } }
    state.__numericKeyboard = { trace, controller }
    document.addEventListener('keydown', (event) => trace.push({ key: event.key, trusted: event.isTrusted }),
      { capture: true, signal: controller.signal })
  })
  try {
    await browser.action('key', { id: 'numeric-step' }).down(Key.ArrowDown).perform(true)
    await expect(input).toHaveValue('79')
    await browser.waitUntil(async () => await numericSceneChecksum() !== originalPixels)
    expect(await shapeDocument()).toEqual(baseline)
    await browser.action('key', { id: 'numeric-step' }).down(Key.ArrowDown).perform(true)
    await expect(input).toHaveValue('78')
    await browser.action('key', { id: 'numeric-step' }).down(Key.Shift).down(Key.ArrowDown).up(Key.Shift).perform(true)
    await expect(input).toHaveValue('68')
    expect(await shapeDocument()).toEqual(baseline)
    await browser.saveScreenshot(`${directory}/${prefix}-held.png`)
    const previewPixels = await numericSceneChecksum()
    await browser.action('key', { id: 'numeric-step' }).up(Key.ArrowDown).perform(true)
    await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)!.opacity === 0.68)
    await browser.waitUntil(async () => await numericSceneChecksum() === previewPixels)
    await $(`button[aria-label="${locale === 'ru' ? 'Отменить' : 'Undo'}"]`).click()
    expect(await shapeDocument()).toEqual(baseline)
    await $(`button[aria-label="${locale === 'ru' ? 'Повторить' : 'Redo'}"]`).click()
    await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)!.opacity === 0.68)
    if (tool === 'shape' && !await input.isDisplayed()) {
      await $('.cs-selection-floating-toolbar [data-shape-control="appearance"]').click()
      await expect(input).toBeDisplayed()
    }

    await setNumericInput(input, '37')
    await browser.keys('ArrowLeft')
    await browser.keys('Home')
    expect((await shapeDocument()).layers.at(-1)!.opacity).toBe(0.68)
    await browser.keys('Tab')
    await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)!.opacity === 0.37)

    await setNumericInput(input, '-')
    await browser.keys('ArrowUp')
    await expect(input).toHaveValue('-')
    await browser.keys('Escape')
    await expect(input).toHaveValue('37')
    await expect($(surface)).toBeDisplayed()
    await browser.action('key', { id: 'numeric-step' }).down(Key.ArrowDown).perform(true)
    await browser.keys('Escape')
    await browser.action('key', { id: 'numeric-step' }).up(Key.ArrowDown).perform(true)
    await expect(input).toHaveValue('37')
    expect((await shapeDocument()).layers.at(-1)!.opacity).toBe(0.37)
    const trace = await browser.execute(() => (window as typeof window & {
      __numericKeyboard: { trace: { key: string; trusted: boolean }[] }
    }).__numericKeyboard.trace)
    expect(trace.length).toBeGreaterThan(5)
    expect(trace.every((event) => event.trusted)).toBe(true)
    await writeFile(`${directory}/${prefix}-input.json`, JSON.stringify({ baseline, trace, capabilities: browser.capabilities }, null, 2))
  } finally {
    await browser.releaseActions()
    await browser.execute(() => (window as typeof window & {
      __numericKeyboard?: { controller: AbortController }
    }).__numericKeyboard?.controller.abort())
  }
}
