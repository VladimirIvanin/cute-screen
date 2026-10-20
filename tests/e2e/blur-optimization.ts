import { writeFile } from 'node:fs/promises'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  contentToCard,
  resolveCompositionLayout,
} from '../../packages/editor-core/src/composition/layout'
import type { EditorDocumentV1 } from '../../packages/editor-core/src/document/types'
import { waitForStableCanvas } from './canvas-ready'
import { setNumericInput } from './numeric-input'

type LiveSample = { hash: number; sceneHash: number; time: number; trusted: boolean }
type Observation = { samples: LiveSample[]; controller: AbortController }
type PaintReport = { stage: string; inputCount: number; paintTimes: number[]; continuous: boolean }

export async function blurDocument(): Promise<EditorDocumentV1> {
  return browser.execute(() => {
    const state = window as typeof window & {
      __cuteScreenE2eM08?: { snapshot(): { document: EditorDocumentV1 } }
      __cuteScreenE2eM05?: { snapshot(): EditorDocumentV1 }
    }
    return (state.__cuteScreenE2eM08?.snapshot().document ?? state.__cuteScreenE2eM05?.snapshot())!
  })
}

async function selectedPoint(
  corner = false,
  id?: string,
) {
  const doc = await blurDocument()
  const layer = id ? doc.layers.find((layer) => layer.id === id)! : doc.layers.findLast((layer) => layer.kind === 'censor')!
  const b = layer.localBounds!
  const t = layer.transform
  const x = (b.x + b.width * (corner ? 1 : .5)) * t.scaleX
  const y = (b.y + b.height * (corner ? 1 : .5)) * t.scaleY
  const angle = t.rotation * Math.PI / 180
  let point = { x: t.translateX + x * Math.cos(angle) - y * Math.sin(angle),
    y: t.translateY + x * Math.sin(angle) + y * Math.cos(angle) }
  let width = doc.crop?.width ?? doc.canvas.width
  let height = doc.crop?.height ?? doc.canvas.height
  if (doc.presentation.composition) {
    const layout = resolveCompositionLayout(doc)
    point = contentToCard(point, layout)
    width = layout.width
    height = layout.height
  } else {
    point.x -= doc.crop?.x ?? 0
    point.y -= doc.crop?.y ?? 0
  }
  const rect = await browser.execute(() =>
    document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
  return { x: Math.round(rect.left + point.x / width * rect.width),
    y: Math.round(rect.top + point.y / height * rect.height) }
}

async function observeMove(
  cancel = false,
  id?: string,
  continuous = false,
): Promise<LiveSample[]> {
  const before = id ? (await blurDocument()).layers.find((layer) => layer.id === id)!.transform : undefined
  const point = await selectedPoint(false, id)
  await browser.execute(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const state = window as typeof window & { __blurLive?: Observation; __blurCurrentPaint?: PaintReport }
    const controller = new AbortController()
    const samples: LiveSample[] = []
    state.__blurLive = { samples, controller }
    const paint: PaintReport = { stage: '', inputCount: 0, paintTimes: [], continuous: false }
    state.__blurCurrentPaint = paint
    let held = false
    canvas.addEventListener('pointerdown', () => {
      held = true
    }, { signal: controller.signal })
    window.addEventListener('pointerup', () => {
      held = false
    }, { signal: controller.signal })
    const observer = new MutationObserver(() => {
      if (held) paint.paintTimes.push(performance.now())
    })
    observer.observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] })
    controller.signal.addEventListener('abort', () => observer.disconnect(), { once: true })
    const thumbnail = document.createElement('canvas')
    thumbnail.width = 160
    thumbnail.height = 100
    const recorder = {
      sample(trusted: boolean) {
        const context = thumbnail.getContext('2d')!
        context.drawImage(canvas, 0, 0, 160, 100)
        let sceneHash = 2166136261
        for (const value of context.getImageData(0, 0, 160, 100).data)
          sceneHash = Math.imul(sceneHash ^ value, 16777619)
        const overlay = document.querySelector<HTMLCanvasElement>('.cs-canvas-overlay')
        if (overlay) {
          const a = canvas.getBoundingClientRect()
          const b = overlay.getBoundingClientRect()
          context.drawImage(overlay, (b.left - a.left) / a.width * 160, (b.top - a.top) / a.height * 100,
            b.width / a.width * 160, b.height / a.height * 100)
        }
        let hash = 2166136261
        for (const value of context.getImageData(0, 0, 160, 100).data) hash = Math.imul(hash ^ value, 16777619)
        samples.push({ hash: hash >>> 0, sceneHash: sceneHash >>> 0, time: performance.now(), trusted })
      },
    }
    canvas.addEventListener('pointermove', (event) => {
      if (event.buttons === 1) paint.inputCount++
      if (event.buttons === 1) setTimeout(() => {
        if (!controller.signal.aborted) recorder.sample(event.isTrusted)
      }, 80)
    }, { signal: controller.signal })
  })
  try {
    const action = browser.action('pointer', { id: 'blur-live' })
      .move({ origin: 'viewport', ...point }).down({ button: 'left' })
    const steps = continuous ? 50 : 5
    for (let i = 1; i <= steps; i++) action.move({ origin: 'viewport',
      x: Math.round(point.x + i * 60 / steps), y: Math.round(point.y + i * 20 / steps),
      duration: continuous ? 20 : 70 }).pause(continuous ? 0 : 200)
    if (cancel) {
      // Keep the button held while Escape cancels the active transaction.
      await action.perform(true)
      await browser.keys('Escape')
      await browser.releaseActions()
    } else await action.up({ button: 'left' }).perform()
    if (
      id &&
      before &&
      !cancel
    ) await browser.waitUntil(async () => {
      const after = (await blurDocument()).layers.find((layer) => layer.id === id)!.transform
      return after.translateX !== before.translateX || after.translateY !== before.translateY
    }, { timeoutMsg: 'The intended shape did not move; pointer hit a different layer' })
    return await browser.execute((stage, continuous) => {
      const state = window as typeof window & {
        __blurLive: Observation
        __blurCurrentPaint: PaintReport
        __blurPaintReports?: PaintReport[]
      }
      state.__blurPaintReports ??= []
      state.__blurPaintReports.push({ ...state.__blurCurrentPaint, stage, continuous })
      return state.__blurLive.samples
    }, id ?? 'censor', continuous)
  } finally {
    await browser.releaseActions()
    await browser.execute(() => (window as typeof window & { __blurLive: Observation }).__blurLive.controller.abort())
  }
}

/** Ordinary objects must keep moving when expensive effects exist elsewhere. */
export async function verifyBlurOtherToolsAndFlip(directory: string): Promise<void> {
  const panel = $('.cs-composition-panel')
  await panel.$('[data-composition-reset]').click()
  await browser.waitUntil(async () => !(await blurDocument()).presentation.composition)
  await $('[data-tool-id="shape"]').click()
  await waitForStableCanvas()
  const before = (await blurDocument()).layers.length
  const rect = await browser.execute(() =>
    document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
  await browser.action('pointer').move({ origin: 'viewport',
    x: Math.round(rect.left + rect.width * .25), y: Math.round(rect.top + rect.height * .25) })
    .down({ button: 'left' }).move({ origin: 'viewport',
      x: Math.round(rect.left + rect.width * .4), y: Math.round(rect.top + rect.height * .4), duration: 150 })
    .up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await blurDocument()).layers.length === before + 1)
  const shape = (await blurDocument()).layers.at(-1)!
  await $('.cs-selection-floating-toolbar [data-shape-control="fill"]').click()
  await $('.cs-shape-fill-options [data-fill-kind="solid"]').click()
  await browser.keys('Escape')
  await expect($('.cs-selection-floating-toolbar [data-shape-control="fill"]'))
    .toHaveAttribute('aria-label', 'Fill: Colour')
  await waitForStableCanvas()
  const samples: { stage: string; frames: LiveSample[] }[] = []
  const plain = await observeMove(false, shape.id)
  expect(new Set(plain.map((frame) => frame.hash)).size).toBeGreaterThanOrEqual(3)
  samples.push({ stage: 'ordinary-shape-with-censor', frames: plain })
  await panel.$('button=Padding').click()
  await panel.$('[data-card-fill="blurred"]').click()
  await browser.waitUntil(async () => (await blurDocument()).presentation.composition?.background.kind === 'blurred')
  await waitForStableCanvas()
  const composed = await observeMove(false, shape.id)
  expect(new Set(composed.map((frame) => frame.hash)).size).toBeGreaterThanOrEqual(3)
  expect(new Set(composed.map((frame) => frame.sceneHash)).size).toBeGreaterThanOrEqual(3)
  samples.push({ stage: 'ordinary-shape-with-censor-and-background', frames: composed })
  for (const label of ['Flip horizontally', 'Flip vertically']) {
    const previous = await blurDocument()
    await $('button[aria-label="Settings"]').click()
    await $(`button=${label}`).click()
    await browser.waitUntil(async () =>
      JSON.stringify((await blurDocument()).layers) !== JSON.stringify(previous.layers))
    const flipped = await blurDocument()
    await $('button[aria-label="Undo"]').click()
    await browser.waitUntil(async () =>
      JSON.stringify((await blurDocument()).layers) === JSON.stringify(previous.layers))
    await $('button[aria-label="Redo"]').click()
    await browser.waitUntil(async () =>
      JSON.stringify((await blurDocument()).layers) === JSON.stringify(flipped.layers))
    await waitForStableCanvas()
    const frames = await observeMove(false, shape.id, true)
    expect(new Set(frames.map((frame) => frame.hash)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(frames.map((frame) => frame.sceneHash)).size).toBeGreaterThanOrEqual(3)
    expect(frames.every((frame) => frame.trusted)).toBe(true)
    samples.push({ stage: label, frames })
  }
  const paints = await browser.execute(() =>
    (window as typeof window & { __blurPaintReports: PaintReport[] }).__blurPaintReports)
  await writeFile(`${directory}/other-tools-flip.json`, JSON.stringify({ samples, paints,
    document: await blurDocument() }, null, 2))
  await browser.saveScreenshot(`${directory}/flipped.png`)
}

export async function verifyBlurOptimization(directory: string): Promise<void> {
  await waitForStableCanvas()
  const initial = (await blurDocument()).layers.length
  await $('[data-tool-id="censor"]').click()
  await $('.cs-censor-effect[aria-label="Blur"]').click()
  const rect = await browser.execute(() =>
    document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
  await browser.action('pointer').move({ origin: 'viewport',
    x: Math.round(rect.left + rect.width * .3), y: Math.round(rect.top + rect.height * .4) })
    .down({ button: 'left' }).move({ origin: 'viewport',
      x: Math.round(rect.left + rect.width * .55), y: Math.round(rect.top + rect.height * .65), duration: 150 })
    .up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await blurDocument()).layers.length === initial + 1)
  await expect($('.cs-selection-floating-toolbar .cs-censor-toolbar')).toBeDisplayed()
  const before = (await blurDocument()).layers.at(-1)!
  const plain = await observeMove()
  await browser.waitUntil(async () =>
    (await blurDocument()).layers.at(-1)!.transform.translateX !== before.transform.translateX)
  const moved = (await blurDocument()).layers.at(-1)!
  expect(new Set(plain.map((sample) => sample.hash)).size).toBeGreaterThanOrEqual(3)
  expect(new Set(plain.map((sample) => sample.sceneHash)).size).toBeGreaterThanOrEqual(3)
  expect(plain.every((sample) => sample.trusted)).toBe(true)
  await $('button[aria-label="Undo"]').click()
  await browser.waitUntil(async () =>
    (await blurDocument()).layers.at(-1)!.transform.translateX === before.transform.translateX)
  await $('button[aria-label="Redo"]').click()
  await browser.waitUntil(async () =>
    (await blurDocument()).layers.at(-1)!.transform.translateX === moved.transform.translateX)
  await $('button[aria-label="Appearance"]').click()
  const panel = $('.cs-composition-panel')
  await panel.$('button=Padding').click()
  await panel.$('[data-card-fill="blurred"]').click()
  await browser.waitUntil(async () => (await blurDocument()).presentation.composition?.background.kind === 'blurred')
  await waitForStableCanvas()
  const composed = await observeMove()
  expect(new Set(composed.map((sample) => sample.hash)).size).toBeGreaterThanOrEqual(3)
  expect(new Set(composed.map((sample) => sample.sceneHash)).size).toBeGreaterThanOrEqual(3)
  const committed = (await blurDocument()).layers.at(-1)!
  await observeMove(true)
  expect((await blurDocument()).layers.at(-1)!.transform).toEqual(committed.transform)
  const corner = await selectedPoint(true)
  await browser.action('pointer').move({ origin: 'viewport', ...corner }).down({ button: 'left' })
    .move({ origin: 'viewport', x: corner.x + 25, y: corner.y + 12, duration: 150 }).up({ button: 'left' }).perform()
  await browser.waitUntil(async () =>
    (await blurDocument()).layers.at(-1)!.localBounds!.width !== committed.localBounds!.width)
  await $('.cs-censor-parameter').click()
  const strength = $('.cs-censor-popover input[aria-label="Blur strength"]')
  await setNumericInput(strength, '24')
  await browser.keys('Enter')
  await browser.keys('Escape')
  const final = await blurDocument()
  const finalCensor = final.layers.findLast((layer) => layer.kind === 'censor')!
  expect(finalCensor.payload.effect).toMatchObject({ mode: 'blur', strength: 24 })
  const idleCanvasResizes = await browser.execute(async () => {
    const state = window as typeof window & {
      __cuteScreenE2eM08?: { waitForRender(): Promise<void> }
      __cuteScreenE2eM05?: { waitForRender(): Promise<void> }
    }
    const harness = state.__cuteScreenE2eM08 ?? state.__cuteScreenE2eM05
    if (!harness) throw new Error('Render observation harness is unavailable')
    await harness.waitForRender()
    const canvas = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!
    let mutations = 0
    const observer = new MutationObserver((records) => {
      mutations += records.length
    })
    observer.observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] })
    await new Promise((resolve) => setTimeout(resolve, 400))
    observer.disconnect()
    return mutations
  })
  expect(idleCanvasResizes).toBe(0)
  await writeFile(`${directory}/live.json`, JSON.stringify({ canvas: final.canvas, plain, composed,
    idleCanvasResizes,
    before: before.transform, after: committed.transform, final: final.layers.at(-1),
    note: 'Trusted input; distinct scene pixels sampled while pointer is held, before commit. Not a reference GPU SLA.' }, null, 2))
  await browser.saveScreenshot(`${directory}/editor.png`)
}
