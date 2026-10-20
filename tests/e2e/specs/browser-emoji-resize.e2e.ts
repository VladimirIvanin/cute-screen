import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type { EmojiLayer } from '../../../packages/editor-core/src'
import { openDrawingHarness } from './browser-m06-test-kit'
import { selectionDocument } from '../selection-interactions'
import { waitForStableCanvas } from '../canvas-ready'
import { setNumericInput } from '../numeric-input'
import { writeFile } from 'node:fs/promises'
import {
  openM08,
  m08Snapshot,
  drawPrecisionTool,
  dragCanvas,
  transformedLayerPoint,
  clickHistory,
} from './browser-m08-test-kit'

async function paintedDifference(bounds: { x: number; y: number; width: number; height: number }): Promise<number> {
  return browser.execute((bounds) => {
    const state = window as typeof window & {
      __resizeReference?: {
        baseline: HTMLCanvasElement
        artwork: HTMLImageElement
        width: number
        height: number
      }
    }
    const { baseline, artwork, width, height } = state.__resizeReference!
    const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const expected = document.createElement('canvas')
    expected.width = scene.width
    expected.height = scene.height
    const context = expected.getContext('2d')!
    context.drawImage(baseline, 0, 0)
    context.save()
    context.scale(scene.width / width, scene.height / height)
    context.drawImage(artwork, bounds.x, bounds.y, bounds.width, bounds.height)
    context.restore()
    const actual = document.createElement('canvas')
    actual.width = scene.width
    actual.height = scene.height
    actual.getContext('2d')!.drawImage(scene, 0, 0)
    // Restrict comparison to the object and its former position; unrelated canvas is irrelevant.
    const x = Math.floor((bounds.x - 100) * scene.width / width)
    const y = Math.floor((bounds.y - 100) * scene.height / height)
    const w = Math.ceil((bounds.width + 200) * scene.width / width)
    const h = Math.ceil((bounds.height + 200) * scene.height / height)
    const a = actual.getContext('2d')!.getImageData(x, y, w, h).data
    const b = context.getImageData(x, y, w, h).data
    return a.reduce((sum, value, index) => sum + Math.abs(value - b[index]!), 0) / a.length
  }, bounds)
}

describe('emoji corner resize through production pointer input', () => {
  for (const handle of ['sw', 'nw', 'ne', 'se'] as const) {
    it(`keeps artwork on its frame during preview, commit, undo and redo: ${handle}`, async () => {
      await browser.setWindowSize(1280, 900)
      await openDrawingHarness(true)
      await $('.cs-zoom-value').click()
      await waitForStableCanvas()
      await $('button[data-tool-id="emoji"]').click()
      await $('.cs-emoji-toolbar button[data-emoji-id="1f525"]').click()
      const placement = await browser.execute(async () => {
        const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
        const rect = scene.getBoundingClientRect()
        const view = document.querySelector('.cs-canvas-scroll')!.getBoundingClientRect()
        const baseline = document.createElement('canvas')
        baseline.width = scene.width
        baseline.height = scene.height
        baseline.getContext('2d')!.drawImage(scene, 0, 0)
        const artwork = new Image()
        artwork.src = document.querySelector<HTMLImageElement>('.cs-emoji-toolbar [data-emoji-id="1f525"] img')!.src
        await artwork.decode()
        const state = window as typeof window & { __resizeReference?: unknown }
        state.__resizeReference = { baseline, artwork, width: 2560, height: 1440 }
        document.documentElement.dataset.resizeTrusted = 'false'
        scene.addEventListener('pointerdown', (event) => {
          document.documentElement.dataset.resizeTrusted = String(event.isTrusted)
        })
        return { x: Math.round((Math.max(rect.left, view.left) + Math.min(rect.right, view.right)) / 2),
          y: Math.round((Math.max(rect.top, view.top) + Math.min(rect.bottom, view.bottom)) / 2) }
      })
      await browser.action('pointer').move({ origin: 'viewport', ...placement }).down().up().perform()
      await browser.waitUntil(async () => (await selectionDocument()).layers.at(-1)?.kind === 'emoji')
      await waitForStableCanvas()
      const before = (await selectionDocument()).layers.at(-1) as EmojiLayer
      const b = before.localBounds!
      const origin = { x: before.transform.translateX + b.x, y: before.transform.translateY + b.y }
      expect(await paintedDifference({ ...origin, width: b.width, height: b.height })).toBeLessThan(1)
      const start = await browser.execute(({ handle, origin, b }) => {
        const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
        return { x: Math.round(rect.left + (origin.x + (handle.includes('w') ? 0 : b.width)) * rect.width / 2560),
          y: Math.round(rect.top + (origin.y + (handle.includes('n') ? 0 : b.height)) * rect.height / 1440) }
      }, { handle, origin, b })
      const dx = handle.includes('w') ? -32 : 32
      const dy = handle.includes('n') ? -32 : 32
      const expected = { x: origin.x + (handle.includes('w') ? -32 : 0),
        y: origin.y + (handle.includes('n') ? -32 : 0), width: b.width + 32, height: b.height + 32 }
      await browser.action('pointer', { id: 'emoji-resize-pointer' }).move({ origin: 'viewport', ...start }).down()
        .move({ origin: 'viewport', x: start.x + dx, y: start.y + dy, duration: 160 }).perform(true)
      await waitForStableCanvas()
      expect((await selectionDocument()).layers.at(-1)).toEqual(before)
      expect(await paintedDifference(expected)).toBeLessThan(1)
      await browser.action('pointer', { id: 'emoji-resize-pointer' }).up().perform()
      await browser.waitUntil(async () => (await selectionDocument()).layers.at(-1)?.localBounds?.width !== b.width)
      await waitForStableCanvas()
      const after = (await selectionDocument()).layers.at(-1)!
      expect(after.transform).toEqual(before.transform)
      await writeFile(`artifacts/frame-snap/emoji-${handle}.json`, JSON.stringify({ before, after, expected }, null, 2))
      expect(await paintedDifference(expected)).toBeLessThan(1)
      await browser.saveScreenshot(`artifacts/browser-e2e/emoji-resize-${handle}.png`)
      await $('button[aria-label="Undo"]').click()
      await browser.waitUntil(async () => (await selectionDocument()).layers.at(-1)?.localBounds?.width === b.width)
      await waitForStableCanvas()
      expect((await selectionDocument()).layers.at(-1)).toEqual(before)
      expect(await paintedDifference({ ...origin, width: b.width, height: b.height })).toBeLessThan(1)
      await $('button[aria-label="Redo"]').click()
      await browser.waitUntil(async () =>
        (await selectionDocument()).layers.at(-1)?.localBounds?.width === after.localBounds!.width)
      await waitForStableCanvas()
      expect((await selectionDocument()).layers.at(-1)).toEqual(after)
      expect(await paintedDifference(expected)).toBeLessThan(1)
      await $('.cs-selection-floating-toolbar button[aria-label="Emoji size"]').click()
      await setNumericInput($('.cs-emoji-popover input[aria-label="Size"]'), '64')
      await browser.keys('Enter')
      await browser.keys('Escape')
      await browser.waitUntil(async () => (await selectionDocument()).layers.at(-1)?.localBounds?.width === 64)
      await waitForStableCanvas()
      const panelBounds = { x: expected.x + 16, y: expected.y + 16, width: 64, height: 64 }
      expect(await paintedDifference(panelBounds)).toBeLessThan(1)
      await $('button[aria-label="Undo"]').click()
      await browser.waitUntil(async () =>
        (await selectionDocument()).layers.at(-1)?.localBounds?.width === after.localBounds!.width)
      await waitForStableCanvas()
      expect((await selectionDocument()).layers.at(-1)).toEqual(after)
      expect(await paintedDifference(expected)).toBeLessThan(1)
      await expect($('html')).toHaveAttribute('data-resize-trusted', 'true')
    })
  }
})

describe('image resize regression on production-sized content', () => {
  it('keeps 4K image pixels stable through bottom-left resize and history', async () => {
    await browser.setWindowSize(1280, 900)
    await browser.url('/')
    await browser.execute(() => window.localStorage.clear())
    await browser.url('/?m05=1&m05viewport=1&imageIngress=1')
    await $('button[data-tool-id="image"]').waitForEnabled()
    await browser.execute(async () => {
      const harness = (window as unknown as { __cuteScreenE2eImages: {
        choose(format: string, width: number, height: number): Promise<void>
        crop(): void
      } }).__cuteScreenE2eImages
      await harness.choose('png', 3840, 2160)
      harness.crop()
    })
    const count = (await selectionDocument()).layers.length
    await browser.keys('g')
    await browser.waitUntil(async () => (await selectionDocument()).layers.length === count + 1)
    await waitForStableCanvas()
    const before = (await selectionDocument()).layers.at(-1)!
    if (before.kind !== 'image') throw new Error('expected imported image')
    const doc = await selectionDocument()
    const geometry = await browser.execute(({ layer, doc }) => {
      const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
      const b = layer.localBounds!, t = layer.transform
      const output = doc.crop ?? { x: 0, y: 0, ...doc.canvas }
      return {
        x: Math.round(rect.left + (t.translateX + b.x * t.scaleX - output.x) * rect.width / output.width),
        y: Math.round(rect.top + (t.translateY + (b.y + b.height) * t.scaleY - output.y)
        * rect.height / output.height),
      }
    }, { layer: before, doc })
    const hash = () => browser.execute(() => {
      const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
      const data = scene.getContext('2d')!.getImageData(0, 0, scene.width, scene.height).data
      let value = 2166136261
      for (let index = 0; index < data.length; index++) value = Math.imul(value ^ data[index]!, 16777619)
      return value >>> 0
    })
    const initial = await hash()
    await browser.action('pointer', { id: 'image-resize-pointer' }).move({ origin: 'viewport', ...geometry }).down()
      .move({ origin: 'viewport', x: geometry.x + 24, y: geometry.y - 24, duration: 160 }).perform(true)
    await waitForStableCanvas()
    const preview = await hash()
    expect(preview).not.toBe(initial)
    expect((await selectionDocument()).layers.at(-1)).toEqual(before)
    await browser.action('pointer', { id: 'image-resize-pointer' }).up().perform()
    await browser.waitUntil(async () =>
      (await selectionDocument()).layers.at(-1)!.transform.scaleX !== before.transform.scaleX,
    )
    await waitForStableCanvas()
    const after = (await selectionDocument()).layers.at(-1)!
    if (after.kind !== 'image') throw new Error('expected resized image')
    expect(await hash()).toBe(preview)
    const fixed = (layer: typeof before) => transformedLayerPoint(layer, {
      x: layer.localBounds!.x + layer.localBounds!.width, y: layer.localBounds!.y,
    })
    expect(fixed(after).x).toBeCloseTo(fixed(before).x)
    expect(fixed(after).y).toBeCloseTo(fixed(before).y)
    await browser.saveScreenshot('artifacts/browser-e2e/resize-4k-image.png')
    await clickHistory('Undo')
    await waitForStableCanvas()
    expect((await selectionDocument()).layers.at(-1)).toEqual(before)
    expect(await hash()).toBe(initial)
    await clickHistory('Redo')
    await waitForStableCanvas()
    expect((await selectionDocument()).layers.at(-1)).toEqual(after)
    expect(await hash()).toBe(preview)
  }).timeout(180_000)
})

describe('ruler endpoint resize regression', () => {
  it('keeps the opposite endpoint fixed and preserves style through history', async () => {
    await browser.setWindowSize(1280, 900)
    await openM08()
    await drawPrecisionTool('Ruler', 'ruler', 0)
    const before = (await m08Snapshot()).document.layers.at(-1)!
    const start = transformedLayerPoint(before, before.payload.start as { x: number; y: number })
    const end = transformedLayerPoint(before, before.payload.end as { x: number; y: number })
    await dragCanvas(end, { x: end.x + 30, y: end.y + 10 }, 'resize-ruler-end')
    await browser.waitUntil(async () =>
      JSON.stringify((await m08Snapshot()).document.layers.at(-1)) !== JSON.stringify(before))
    const after = (await m08Snapshot()).document.layers.at(-1)!
    const fixed = transformedLayerPoint(after, after.payload.start as { x: number; y: number })
    expect(fixed.x).toBeCloseTo(start.x)
    expect(fixed.y).toBeCloseTo(start.y)
    expect(after.payload.thickness).toBe(before.payload.thickness)
    expect(after.payload.fontSize).toBe(before.payload.fontSize)
    expect(after.transform.scaleX).toBe(1)
    expect(after.transform.scaleY).toBe(1)
    await clickHistory('Undo')
    expect((await m08Snapshot()).document.layers.at(-1)).toEqual(before)
    await clickHistory('Redo')
    expect((await m08Snapshot()).document.layers.at(-1)).toEqual(after)
  })
})
