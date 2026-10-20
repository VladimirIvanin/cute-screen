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
import { highlighterToolbarSelector } from './highlighter-toolbar'
import { waitForStableCanvas } from './canvas-ready'

type Sample = { stage: string; pixels: number; layers: number; trusted: boolean }
type Observation = { samples: Sample[]; controller: AbortController }

async function scenePixels(): Promise<number> {
  return browser.execute(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    // The content band includes the entire stroke, excluding unrelated background/shadow rasterization.
    const pixels = canvas.getContext('2d')!.getImageData(Math.round(canvas.width * .25),
      Math.round(canvas.height * .6), Math.round(canvas.width * .5), Math.round(canvas.height * .2)).data
    let hash = 2166136261
    for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619)
    return hash >>> 0
  })
}

/** One WebDriver sequence preserves capture across modifiers; observation never dispatches input. */
async function observeStroke(cancel = false): Promise<Sample[]> {
  const p = await browser.execute(() => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    return { x: Math.round(rect.left + rect.width * .3), y: Math.round(rect.top + rect.height * .7),
      middle: Math.round(rect.left + rect.width * .45), end: Math.round(rect.left + rect.width * .65) }
  })
  await browser.execute(() => {
    const state = window as typeof window & {
      __highlighterLive?: Observation
      __cuteScreenE2eM05?: { snapshot(): { layers: unknown[] } }
      __cuteScreenE2eM08?: { snapshot(): { document: { layers: unknown[] } } }
    }
    const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const controller = new AbortController()
    const samples: Sample[] = []
    state.__highlighterLive = { controller, samples }
    // Object methods survive WDIO serialization without a transpiler's external __name helper.
    const recorder = {
      record(
        stage: string,
        trusted: boolean,
      ) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const pixels = canvas.getContext('2d')!.getImageData(Math.round(canvas.width * .25),
            Math.round(canvas.height * .6), Math.round(canvas.width * .5), Math.round(canvas.height * .2)).data
          let hash = 2166136261
          for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619)
          const doc = state.__cuteScreenE2eM05?.snapshot() ?? state.__cuteScreenE2eM08?.snapshot().document
          samples.push({ stage, pixels: hash >>> 0, layers: doc!.layers.length, trusted })
        }))
      },
    }
    canvas.addEventListener('pointermove', (event) => {
      if (event.buttons === 1) recorder.record('move', event.isTrusted)
    }, { signal: controller.signal })
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Shift' || event.key === 'Escape') recorder.record(event.key, event.isTrusted)
    }, { signal: controller.signal })
    window.addEventListener('keyup', (event) => {
      if (event.key === 'Shift') recorder.record('ShiftUp', event.isTrusted)
    }, { signal: controller.signal })
  })
  try {
    const pointer = browser.action('pointer', { id: 'composition-highlighter' })
      .move({ origin: 'viewport', x: p.x, y: p.y }).down({ button: 'left' })
      .move({ origin: 'viewport', x: p.middle, y: p.y, duration: 120 }).pause(200)
      .pause(0).pause(200)
      .move({ origin: 'viewport', x: p.end, y: p.y, duration: 120 }).pause(200)
      .pause(0).pause(200).pause(0).pause(200).up({ button: 'left' }).pause(200)
    const keyboard = browser.action('key', { id: 'composition-shift' })
      .pause(0).pause(0).pause(0).pause(200).down(Key.Shift).pause(200)
      .pause(0).pause(200).up(Key.Shift).pause(200)
    if (cancel) keyboard.down(Key.Escape).up(Key.Escape)
    else keyboard.pause(0).pause(200)
    keyboard.pause(0).pause(200)
    await browser.performActions([pointer.toJSON(), keyboard.toJSON()])
    return await browser.execute(() => (window as typeof window & {
      __highlighterLive: Observation
    }).__highlighterLive.samples)
  } finally {
    await browser.releaseActions()
    await browser.execute(() => (window as typeof window & {
      __highlighterLive?: Observation
    }).__highlighterLive?.controller.abort())
  }
}

/** Enter through real Appearance controls and compare draft pixels before pointerup. */
export async function verifyCompositionHighlighterPreview(
  directory: string,
  prefix: string,
): Promise<void> {
  await $('button[aria-label="Appearance"]').click()
  await $('.cs-composition-panel').$('button=Padding').click()
  await $('button[aria-label="Close appearance"]').click()
  await $('.cs-zoom-fit').click()
  await $('.cs-toolrail [data-tool-id="marker"]').click()
  await waitForStableCanvas()
  const results: { mode: string; baseline: number; samples: Sample[]; cancelled: Sample[] }[] = []
  for (const mode of ['Tint', 'Highlight', 'Illuminate']) {
    await $(highlighterToolbarSelector).$('button[aria-label="Effect"]').click()
    await $(`.cs-highlighter-mode[aria-label="${mode}"]`).click()
    await waitForShapeAnimation()
    await waitForStableCanvas()
    const baselineDocument = await shapeDocument()
    const baseline = await scenePixels()
    const samples = await observeStroke()
    await writeFile(`${directory}/${prefix}-samples.json`, JSON.stringify({ mode, baseline, samples }, null, 2))
    const shift = samples.find((sample) => sample.stage === 'Shift')!
    const released = samples.find((sample) => sample.stage === 'ShiftUp')!
    expect(shift).toBeDefined()
    expect(released).toBeDefined()
    expect(shift.pixels).not.toBe(baseline)
    expect(released.pixels).not.toBe(shift.pixels)
    expect(samples.filter((sample) => sample.stage !== 'Escape').every((sample) =>
      sample.layers === baselineDocument.layers.length && sample.trusted)).toBe(true)
    // Modifier-only redraws preserve intensity; the next move extends the path.
    expect(samples[samples.indexOf(shift) - 1]!.pixels).toBe(shift.pixels)
    expect(samples[samples.indexOf(released) - 1]!.pixels).toBe(released.pixels)
    await browser.waitUntil(async () => (await shapeDocument()).layers.length === baselineDocument.layers.length + 1)
    await waitForStableCanvas()
    expect(await scenePixels()).toBe(released.pixels)
    await expect($('.cs-toolrail [data-tool-id="marker"]')).toHaveAttribute('aria-pressed', 'true')
    await browser.saveScreenshot(`${directory}/${prefix}-${mode.toLowerCase()}.png`)
    await $('button[aria-label="Undo"]').click()
    await waitForStableCanvas()
    expect(await scenePixels()).toBe(baseline)
    expect((await shapeDocument()).layers).toEqual(baselineDocument.layers)
    await $('button[aria-label="Redo"]').click()
    await waitForStableCanvas()
    expect(await scenePixels()).toBe(released.pixels)
    await $('button[aria-label="Undo"]').click()
    await waitForStableCanvas()
    const cancelled = await observeStroke(true)
    expect(cancelled.find((sample) => sample.stage === 'Shift')!.pixels).not.toBe(baseline)
    expect(cancelled.find((sample) => sample.stage === 'Escape')!.pixels).toBe(baseline)
    expect(cancelled.every((sample) => sample.layers === baselineDocument.layers.length && sample.trusted)).toBe(true)
    expect(await scenePixels()).toBe(baseline)
    expect((await shapeDocument()).layers).toEqual(baselineDocument.layers)
    results.push({ mode, baseline, samples, cancelled })
  }
  await writeFile(`${directory}/${prefix}.json`, JSON.stringify({ results, capabilities: browser.capabilities }, null, 2))
}
