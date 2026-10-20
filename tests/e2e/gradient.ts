import { writeFile } from 'node:fs/promises'
import { Key } from 'webdriverio'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { waitForStableCanvas } from './canvas-ready'
import {
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'
import { setNumericInput } from './numeric-input'

export interface GradientSnapshot {
  canvas: { width: number
    height: number }
  crop: { x: number
    y: number
    width: number
    height: number } | null
  layers: {
    id: string
    kind: string
    locked: boolean
    opacity: number
    transform: { translateX: number
      translateY: number
      rotation: number }
    localBounds: { width: number
      height: number }
    payload: { annotationTool?: string
      fill?: { kind: string
        start: { x: number
          y: number }
        end: { x: number
          y: number }
        stops: unknown[] } } }[]
}
export async function gradientDocument(): Promise<GradientSnapshot> {
  return await shapeDocument() as unknown as GradientSnapshot
}
async function canvasRect() {
  await waitForStableCanvas()
  return browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
}
async function tool(id: string): Promise<void> {
  await $(`.cs-toolrail [data-tool-id="${id}"]`).click()
  await browser.action('pointer').move({ origin: 'viewport', x: 5, y: 5 }).perform()
}
async function drag(
  start: { x: number; y: number },
  end: { x: number; y: number },
): Promise<void> {
  await browser.action('pointer')
    .move({ origin: 'viewport', x: Math.round(start.x), y: Math.round(start.y) })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(end.x), y: Math.round(end.y), duration: 180 })
    .up({ button: 'left' }).perform()
}

async function verifyGradientMagnet(directory: string): Promise<void> {
  const original = (await gradientDocument()).layers.at(-1)!
  const snapshot = await gradientDocument()
  const frame = snapshot.crop ?? { x: 0, y: 0, ...snapshot.canvas }
  const rect = await canvasRect()
  const scale = rect.width / frame.width
  const center = (layer: typeof original) => ({
    x: Math.round(rect.left + (layer.transform.translateX - frame.x + layer.localBounds.width / 2) * scale),
    y: Math.round(rect.top + (layer.transform.translateY - frame.y + layer.localBounds.height / 2) * scale),
  })
  const move = async (x: number, y: number) => browser.action('pointer', { id: 'gradient-magnet-pointer' })
    .move({ origin: 'viewport', x: Math.round(x), y: Math.round(y), duration: 100 }).perform(true)
  const down = async (point: { x: number; y: number }) => browser.action('pointer', { id: 'gradient-magnet-pointer' })
    .move({ origin: 'viewport', ...point }).down({ button: 'left' }).perform(true)
  const up = async () => browser.action('pointer', { id: 'gradient-magnet-pointer' }).up({ button: 'left' }).perform(true)
  const latest = async () => (await gradientDocument()).layers.at(-1)!
  const undoTo = async (layer: typeof original) => {
    await browser.keys(['Control', 'z'])
    await browser.waitUntil(async () => JSON.stringify(await latest()) === JSON.stringify(layer))
  }
  await browser.execute(() => {
    const events: { type: string; trusted: boolean; x?: number; y?: number; target?: string }[] = []
    const controller = new AbortController()
    const target = window as unknown as {
      __gradientMagnetInput: { events: typeof events; controller: AbortController }
    }
    target.__gradientMagnetInput = { events, controller }
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'keydown']) {
      document.addEventListener(type, (event) => {
        events.push({ type: event.type, trusted: event.isTrusted,
          ...(event instanceof PointerEvent ? { x: event.clientX, y: event.clientY } : {}),
          target: event.target instanceof Element ? String(event.target.className) : '' })
      }, { signal: controller.signal })
    }
  })
  try {
    const start = center(original)
    const corner = { x: start.x + (frame.x - original.transform.translateX) * scale,
      y: start.y + (frame.y - original.transform.translateY) * scale }
    await down(start)
    await move(corner.x + 4, corner.y + 4)
    await move(corner.x + 11, corner.y + 11)
    expect(await latest()).toEqual(original) // Scene preview must not mutate the document.
    await browser.saveScreenshot(`${directory}/gradient-magnet-held.png`)
    await up()
    const snapped = await latest()
    const trace = await browser.execute(() => (window as unknown as {
      __gradientMagnetInput: { events: unknown[] }
    }).__gradientMagnetInput.events)
    await writeFile(`${directory}/gradient-magnet-capture.json`, JSON.stringify({
      original, snapped, frame, rect, scale, start, corner, trace,
    }, null, 2))
    expect(snapped.transform.translateX).toBeCloseTo(frame.x, 8)
    expect(snapped.transform.translateY).toBeCloseTo(frame.y, 8)
    expect(snapped.localBounds).toEqual(original.localBounds)
    expect(snapped.payload).toEqual(original.payload)
    await undoTo(original)
    await browser.keys(['Control', 'Shift', 'z'])
    await browser.waitUntil(async () => JSON.stringify(await latest()) === JSON.stringify(snapped))

    const origin = center(snapped)
    await down(origin)
    await move(origin.x + 5, origin.y + 5)
    await move(origin.x + 11, origin.y + 11)
    await move(origin.x + 20, origin.y + 20)
    await up()
    const released = await latest()
    expect((released.transform.translateX - frame.x) * scale).toBeCloseTo(20, 0)
    expect((released.transform.translateY - frame.y) * scale).toBeCloseTo(20, 0)
    await undoTo(snapped)

    await down(origin)
    await move(origin.x + 5, origin.y + 5)
    await browser.action('key', { id: 'gradient-magnet-key' }).down(Key.Control).perform(true)
    await move(origin.x + 9, origin.y + 9)
    await up()
    await browser.action('key', { id: 'gradient-magnet-key' }).up(Key.Control).perform(true)
    const bypassed = await latest()
    expect((bypassed.transform.translateX - frame.x) * scale).toBeCloseTo(9, 0)
    expect((bypassed.transform.translateY - frame.y) * scale).toBeCloseTo(9, 0)
    await undoTo(snapped)

    await down(origin)
    await move(origin.x + 5, origin.y + 5)
    await browser.keys('Escape')
    await up()
    expect(await latest()).toEqual(snapped)
    await undoTo(original) // Cancel added no history entry; one undo restores the initial placement.
    const input = await browser.execute(() => {
      const trace = (window as unknown as {
        __gradientMagnetInput: { events: { type: string; trusted: boolean }[] }
      }).__gradientMagnetInput
      return trace.events
    })
    expect(input.some((event) => event.type === 'pointermove' && event.trusted)).toBe(true)
    await writeFile(`${directory}/gradient-magnet.json`, JSON.stringify({ original, snapped, released, bypassed, input }, null, 2))
  } finally {
    await browser.releaseActions()
    await browser.execute(() => {
      const target = window as unknown as { __gradientMagnetInput?: { controller: AbortController } }
      target.__gradientMagnetInput?.controller.abort()
      delete target.__gradientMagnetInput
    })
  }
}

export async function verifyGradient(directory: string): Promise<void> {
  await tool('gradient')
  const rect = await canvasRect()
  await drag(
    { x: rect.left + rect.width * .15, y: rect.top + rect.height * .42 },
    { x: rect.left + rect.width * .82, y: rect.top + rect.height * .87 },
  )
  const toolbar = $('.cs-selection-floating-toolbar .cs-gradient-toolbar')
  await expect(toolbar).toBeDisplayed()
  const initial = (await gradientDocument()).layers.at(-1)!
  expect(initial.payload).toMatchObject({ annotationTool: 'gradient', fill: { kind: 'linearGradient', start: { x: .5, y: 1 }, end: { x: .5, y: 0 } } })
  await verifyGradientMagnet(directory)
  await toolbar.$('button[aria-label="Placement"]').click()
  await $('[data-gradient-placement="gradientFitWidth"]').click()
  await browser.keys('Escape')
  const document = await gradientDocument(), full = document.layers.at(-1)!
  const frame = document.crop ?? { x: 0, y: 0, ...document.canvas }
  expect(full.transform.translateX).toBe(frame.x)
  expect(full.localBounds.width).toBe(frame.width)
  await toolbar.$('button=Transition').click()
  const currentRect = await canvasRect()
  const x = currentRect.left + currentRect.width * .5
  const y = currentRect.top + (full.transform.translateY - frame.y) / frame.height * currentRect.height
  const before = JSON.stringify(full.payload.fill)
  await drag({ x, y }, { x: x + 35, y: y + 30 })
  await browser.waitUntil(async () => JSON.stringify((await gradientDocument()).layers.at(-1)!.payload.fill) !== before)
  const adjusted = (await gradientDocument()).layers.at(-1)!
  expect(adjusted.localBounds).toEqual(full.localBounds)
  await browser.keys(['Control', 'z'])
  await browser.waitUntil(async () => JSON.stringify((await gradientDocument()).layers.at(-1)!.payload.fill) === before)
  await browser.keys(['Control', 'Shift', 'z'])
  await browser.waitUntil(async () =>
    JSON.stringify((await gradientDocument()).layers.at(-1)!.payload.fill) === JSON.stringify(adjusted.payload.fill))
  await toolbar.$('button[aria-label="Gradient settings"]').click()
  await waitForShapeAnimation()
  await $('button[aria-label="Add gradient stop"]').click()
  await browser.waitUntil(async () => (await gradientDocument()).layers.at(-1)!.payload.fill!.stops.length === 3)
  const opacity = $('input[aria-label="Stop opacity"]')
  await setNumericInput(opacity, '40')
  await browser.keys('Enter')
  await browser.keys('Escape')
  await $('.cs-gradient-popover').waitForExist({ reverse: true })
  await toolbar.$('button=Size').click()
  await browser.saveScreenshot(`${directory}/gradient.png`)
  await tool('text')
  const textRect = await canvasRect()
  await browser.action('pointer').move({ origin: 'viewport', x: Math.round(textRect.left + textRect.width * .3), y: Math.round(textRect.top + textRect.height * .8) }).down({ button: 'left' }).up({ button: 'left' }).perform()
  await $('.cs-text-editor').waitForDisplayed()
  await $('[data-text-control="color"] button').click()
  await $('button[aria-label="White"]').click()
  await $('[data-text-control="size"]').click()
  const fontSize = Math.min(144, Math.max(18, Math.round(28 * frame.width / textRect.width)))
  await setNumericInput($('input[aria-label="Font size value"]'), String(fontSize))
  await browser.keys('Enter')
  await browser.keys('Escape')
  await $('.cs-text-editor').click()
  await browser.keys('Gradient backdrop')
  await browser.keys(['Control', 'Enter'])
  await browser.waitUntil(async () => (await gradientDocument()).layers.some((layer) => layer.kind === 'text' && (layer.payload as unknown as { content?: { text: string } }).content?.text === 'Gradient backdrop'))
  await browser.saveScreenshot(`${directory}/gradient-text.png`)
  await writeFile(`${directory}/gradient-document.json`, JSON.stringify(await gradientDocument(), null, 2))
}
