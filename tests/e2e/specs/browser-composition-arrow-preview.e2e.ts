import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { resolveCompositionLayout } from '../../../packages/editor-core/src/composition/layout'
import type {
  ArrowLayer,
  EditorDocumentV1,
} from '../../../packages/editor-core/src/document/types'
import { openDrawingHarness } from './browser-m06-test-kit'
import { waitForStableCanvas } from '../canvas-ready'

async function snapshot(): Promise<EditorDocumentV1> {
  return browser.execute(() => (window as typeof window & {
    __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 }
  }).__cuteScreenE2eM05.snapshot())
}

async function scenePixels(): Promise<string> {
  return browser.execute(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await (window as typeof window & {
      __cuteScreenE2eM05: { waitForRender(): Promise<void> }
    }).__cuteScreenE2eM05.waitForRender()
    const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    // The arrow and both drag positions are in the middle of the screenshot.
    // Inspect its content pixels, excluding frame chrome and outer shadows.
    const pixels = canvas.getContext('2d')!.getImageData(
      Math.floor(canvas.width * .25), Math.floor(canvas.height * .2),
      Math.floor(canvas.width * .5), Math.floor(canvas.height * .6),
    ).data
    let hash = 2166136261
    for (const channel of pixels) hash = Math.imul(hash ^ channel, 16777619)
    return `${canvas.width}:${canvas.height}:${hash}`
  })
}

async function endpoint(arrow: ArrowLayer) {
  const layout = resolveCompositionLayout(await snapshot())
  const local = arrow.payload.start
  const t = arrow.transform
  const angle = t.rotation * Math.PI / 180
  const world = {
    x: t.translateX + local.x * t.scaleX * Math.cos(angle) - local.y * t.scaleY * Math.sin(angle),
    y: t.translateY + local.x * t.scaleX * Math.sin(angle) + local.y * t.scaleY * Math.cos(angle),
  }
  return browser.execute(({ layout, world }) => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    const x = layout.content.x + (world.x - layout.source.x) * layout.scale
    const y = layout.content.y + (world.y - layout.source.y) * layout.scale
    return {
      x: Math.round(rect.left + x * rect.width / layout.width),
      y: Math.round(rect.top + y * rect.height / layout.height),
    }
  }, { layout, world })
}

describe('arrow live preview inside appearance', () => {
  it('updates scene pixels before release, cancels, then commits one undoable endpoint edit', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness(true, true)
    await $('button[aria-label="Arrow"]').click()
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    const count = (await snapshot()).layers.length
    await browser.action('pointer').move({ origin: scene, x: -70, y: -35 }).down({ button: 'left' })
      .move({ origin: 'pointer', x: 140, y: 70, duration: 180 }).up({ button: 'left' }).perform()
    await browser.waitUntil(async () => (await snapshot()).layers.length === count + 1)
    const arrow = (await snapshot()).layers.at(-1) as ArrowLayer
    expect(arrow.kind).toBe('arrow')
    await $('button[aria-label="Appearance"]').click()
    await $('[data-composition-section="frame"]').click()
    await $('.cs-card-frame-types input[value="browser"] + span').click()
    await $('.cs-card-models input[value="retro-windows"] + span').click()
    await $('button[aria-label="Appearance"]').click()
    await waitForStableCanvas()
    const before = await snapshot()
    const originalPixels = await scenePixels()
    await browser.saveScreenshot('artifacts/browser-e2e/composition-arrow-before.png')
    const start = await endpoint(arrow)
    const move = async (dx: number, dy: number) => browser.action('pointer')
      .move({ origin: 'viewport', x: start.x + dx, y: start.y + dy, duration: 180 }).perform(true)
    const down = async () => browser.action('pointer').move({ origin: 'viewport', ...start })
      .down({ button: 'left' }).perform(true)
    await down()
    await move(40, -40)
    await browser.waitUntil(async () => (await scenePixels()) !== originalPixels,
      { timeoutMsg: 'Arrow scene stayed at its committed geometry during endpoint drag' })
    const firstPreview = await scenePixels()
    await move(70, -70)
    await browser.waitUntil(async () => (await scenePixels()) !== firstPreview)
    expect(await snapshot()).toEqual(before)
    await browser.saveScreenshot('artifacts/browser-e2e/composition-arrow-live.png')
    await browser.keys('Escape')
    await browser.action('pointer').up({ button: 'left' }).perform()
    expect(await snapshot()).toEqual(before)
    await browser.waitUntil(async () => (await scenePixels()) === originalPixels)
    expect(await snapshot()).toEqual(before)
    await down()
    await move(70, -70)
    await browser.waitUntil(async () => (await scenePixels()) !== originalPixels)
    await browser.action('pointer').up({ button: 'left' }).perform()
    await browser.waitUntil(async () => JSON.stringify((await snapshot()).layers) !== JSON.stringify(before.layers))
    const after = await snapshot()
    await $('button[aria-label="Undo"]').click()
    expect((await snapshot()).layers).toEqual(before.layers)
    await browser.waitUntil(async () => (await scenePixels()) === originalPixels)
    await $('button[aria-label="Redo"]').click()
    expect((await snapshot()).layers).toEqual(after.layers)
  }).timeout(90000)
})
