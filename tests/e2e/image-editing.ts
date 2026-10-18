import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type {
  EditorDocumentV1,
  ImageLayer,
} from '../../packages/editor-core/src'
import { selectionDocument } from './selection-interactions'
import { waitForStableCanvas } from './canvas-ready'

async function pixels(): Promise<string> {
  return browser.execute(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let hash = 2166136261
    for (let index = 0; index < data.length; index += 4) {
      hash = Math.imul(hash ^ data[index]!, 16777619)
      hash = Math.imul(hash ^ data[index + 1]!, 16777619)
      hash = Math.imul(hash ^ data[index + 2]!, 16777619)
      hash = Math.imul(hash ^ data[index + 3]!, 16777619)
    }
    const key = `${canvas.width}:${canvas.height}:${hash >>> 0}`
    const state = window as unknown as { __imagePixelFrames?: Map<string, Uint8ClampedArray> }
    const frames = state.__imagePixelFrames ??= new Map()
    frames.delete(key)
    frames.set(key, data)
    if (frames.size > 16) frames.delete(frames.keys().next().value!)
    return key
  })
}
async function samePixels(
  expected: string,
  actual: string,
): Promise<boolean> {
  if (expected === actual) return true
  if (!process.env.CUTE_SCREEN_E2E_SCENARIO) return false
  // Native resampling of the high-frequency fixture differs from CPU readback.
  // Compare 8px block means; document geometry and decoded exports stay exact.
  return browser.execute(({ expected, actual }) => {
    const frames = (window as unknown as { __imagePixelFrames: Map<string, Uint8ClampedArray> }).__imagePixelFrames
    const before = frames.get(expected), after = frames.get(actual)
    if (
      !before ||
      !after ||
      before.length !== after.length
    ) return false
    const width = Number(expected.split(':')[0]), height = Number(expected.split(':')[1])
    if (expected.split(':').slice(0, 2).join(':') !== actual.split(':').slice(0, 2).join(':')) return false
    let maximum = 0
    for (let y = 0; y < height; y += 8) {
      for (let x = 0; x < width; x += 8) {
        const sums = [0, 0, 0, 0]
        let samples = 0
        for (let dy = y; dy < Math.min(y + 8, height); dy++) {
          for (let dx = x; dx < Math.min(x + 8, width); dx++) {
            samples++
            const index = (dy * width + dx) * 4
            for (let channel = 0; channel < 4; channel++) {
              sums[channel]! += before[index + channel]! - after[index + channel]!
            }
          }
        }
        for (const sum of sums) maximum = Math.max(maximum, Math.abs(sum) / samples)
      }
    }
    return maximum <= 2
  }, { expected, actual })
}
async function settledPixels(): Promise<string> {
  let previous = '', stable = 0
  await browser.waitUntil(async () => {
    const next = await pixels()
    stable = previous && await samePixels(previous, next) ? stable + 1 : 0
    previous = next
    return stable >= 2
  }, { interval: 100, timeoutMsg: 'Image pixels did not settle before pointer input' })
  return previous
}
async function geometry(
  image: ImageLayer,
  doc: EditorDocumentV1,
) {
  return browser.execute(({ image, doc }) => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    const out = document.querySelector('.cs-quick-actions') ? { x: 0, y: 0, ...doc.canvas }
      : doc.crop ?? { x: 0, y: 0, ...doc.canvas }
    const sx = rect.width / out.width, sy = rect.height / out.height
    const b = image.localBounds, t = image.transform
    const center = {
      x: rect.left + (t.translateX + (b.x + b.width / 2) * t.scaleX - out.x) * sx,
      y: rect.top + (t.translateY + (b.y + b.height / 2) * t.scaleY - out.y) * sy,
    }
    const corner = {
      x: rect.left + (t.translateX + (b.x + b.width) * t.scaleX - out.x) * sx,
      y: rect.top + (t.translateY + b.y * t.scaleY - out.y) * sy,
    }
    const dx = corner.x - center.x, dy = corner.y - center.y, len = Math.hypot(dx, dy)
    return { center, corner, rotation: { x: corner.x + dx / len * 14, y: corner.y + dy / len * 14 } }
  }, { image, doc })
}
async function down(point: { x: number; y: number }): Promise<void> {
  await browser.action('pointer').move({ origin: 'viewport', x: Math.round(point.x), y: Math.round(point.y) })
    .down({ button: 'left' }).perform(true)
}
async function up(): Promise<void> {
  await browser.action('pointer').up({ button: 'left' }).perform()
}

/** Called immediately after production G import, before adding any other image. */
export async function verifyImageEditing(output: string): Promise<void> {
  const original = await selectionDocument()
  const image = original.layers.at(-1)!
  if (image.kind !== 'image') throw new Error('Expected an imported image')
  await waitForStableCanvas()
  await expect($('.cs-image-toolbar')).toBeDisplayed()
  let initial = await settledPixels()
  const points = await geometry(image, original)
  await down(points.center)
  expect(await samePixels(initial, await pixels())).toBe(true)
  await up()
  expect((await selectionDocument()).layers).toEqual(original.layers)
  for (const kind of ['move', 'resize', 'rotate'] as const) {
    // Separate gestures from the preceding click/undo sequence. Double-click
    // cycling is intentional and is covered by the selection interaction suite.
    await browser.pause(1100)
    await waitForStableCanvas()
    const points = await geometry(image, await selectionDocument())
    // Native resource handoff after Quick → Editor may finish between gestures.
    // Compare each press against its immediately preceding rendered frame.
    initial = await settledPixels()
    // Keep the next press outside the platform double-click rectangle: a real
    // double click intentionally cycles through overlapping layers.
    const start = kind === 'move' ? {
      x: points.center.x + Math.min(30, (points.corner.x - points.center.x) * .2), y: points.center.y,
    } : kind === 'resize' ? points.corner : points.rotation
    const end = kind === 'rotate' ? {
      x: points.center.x + (start.x - points.center.x) * .94 - (start.y - points.center.y) * .342,
      y: points.center.y + (start.x - points.center.x) * .342 + (start.y - points.center.y) * .94,
    } : { x: start.x - 24, y: start.y + 12 }
    await down(start)
    const pressed = await pixels()
    if (!await samePixels(initial, pressed)) {
      const difference = await browser.execute(({ initial, pressed }) => {
        const frames = (window as unknown as { __imagePixelFrames: Map<string, Uint8ClampedArray> }).__imagePixelFrames
        const before = frames.get(initial)!, after = frames.get(pressed)!
        let channels = 0, maximum = 0
        for (let index = 0; index < before.length; index++) {
          const delta = Math.abs(before[index]! - after[index]!)
          if (delta) channels++
          maximum = Math.max(maximum, delta)
        }
        return { channels, maximum }
      }, { initial, pressed })
      throw new Error(`${kind} changed pixels at pointerdown; difference=${JSON.stringify(difference)}`)
    }
    await browser.action('pointer').move({ origin: 'viewport', x: Math.round(end.x), y: Math.round(end.y), duration: 150 }).perform(true)
    const held = await pixels()
    if (await samePixels(initial, held)) {
      const cursor = await $('.cs-canvas:not(.cs-canvas-overlay)').getCSSProperty('cursor')
      await browser.saveScreenshot(`${output}-${kind}-unchanged.png`)
      await up()
      const after = (await selectionDocument()).layers.at(-1)?.transform
      throw new Error([
        `${kind} did not update preview pixels`, `cursor=${cursor.value}`, `after=${JSON.stringify(after)}`,
      ].join('; '))
    }
    expect((await selectionDocument()).layers).toEqual(original.layers)
    await browser.saveScreenshot(`${output}-${kind}-held.png`)
    await up()
    await browser.waitUntil(async () => samePixels(held, await pixels()), { timeoutMsg: `${kind} pixels changed at pointerup` })
    const changed = (await selectionDocument()).layers
    expect(changed).not.toEqual(original.layers)
    await browser.keys(['Control', 'z'])
    await browser.waitUntil(async () => samePixels(initial, await pixels()))
    expect((await selectionDocument()).layers).toEqual(original.layers)
    await browser.keys(['Control', 'Shift', 'z'])
    await browser.waitUntil(async () => samePixels(held, await pixels()))
    expect((await selectionDocument()).layers).toEqual(changed)
    await browser.keys(['Control', 'z'])
    await browser.waitUntil(async () => samePixels(initial, await pixels()))
  }
  initial = await settledPixels()
  const cancelPoints = await geometry(image, await selectionDocument())
  await down(cancelPoints.rotation)
  await browser.action('pointer').move({ origin: 'viewport', x: Math.round(cancelPoints.rotation.x - 32),
    y: Math.round(cancelPoints.rotation.y + 40), duration: 150 }).perform(true)
  expect(await samePixels(initial, await pixels())).toBe(false)
  await browser.keys('Escape')
  await up()
  await browser.waitUntil(async () => samePixels(initial, await pixels()))
  expect((await selectionDocument()).layers).toEqual(original.layers)
  const radius = $('[data-image-control="imageRadius"]')
  const radiusValue = Math.min(image.localBounds!.width, image.localBounds!.height) / 2
  await radius.click()
  const input = $('.cs-image-popover input[role="spinbutton"]')
  // Native select-all avoids WebDriver clear() bypassing Naive UI's model.
  await input.click()
  await browser.keys(['Control', 'a'])
  await browser.keys(String(radiusValue))
  await expect(input).toHaveValue(String(radiusValue))
  await expect(input).toBeFocused()
  await browser.keys('Enter')
  await browser.waitUntil(async () => {
    const layer = (await selectionDocument()).layers.find((item) => item.id === image.id)
    return layer?.kind === 'image' && layer.payload.radius === radiusValue
  }, { timeoutMsg: 'Image radius did not commit from the numeric input' })
  await browser.keys('Escape')
  await expect(radius).toBeFocused()
  await browser.waitUntil(async () => (await radius.getText()).replace(/[,\s]/g, '').includes(`${radiusValue}px`))
  await $('[data-image-control="imageBorderWidth"]').click()
  await expect($('.cs-image-popover .cs-simple-color-grid')).toBeDisplayed()
  const borderInput = $('.cs-image-popover input[role="spinbutton"]')
  await borderInput.click()
  await browser.keys(['Control', 'a'])
  await browser.keys('32')
  await browser.keys('Enter')
  await browser.waitUntil(async () => {
    const layer = (await selectionDocument()).layers.find((item) => item.id === image.id)
    return layer?.kind === 'image' && layer.payload.border?.width === 32
  }, { timeoutMsg: 'Image border did not commit the expanded width' })
  expect(await browser.execute(() => {
    const panel = document.querySelector<HTMLElement>('.cs-image-popover')!
    return panel.scrollWidth <= panel.clientWidth
  })).toBe(true)
  await browser.saveScreenshot(`${output}-border-settings.png`)
  await browser.keys('Escape')
  await radius.click()
  const zeroInput = $('.cs-image-popover input[role="spinbutton"]')
  await zeroInput.click()
  await browser.keys(['Control', 'a'])
  await browser.keys('0')
  await browser.keys('Enter')
  await browser.waitUntil(async () => {
    const layer = (await selectionDocument()).layers.find((item) => item.id === image.id)
    return layer?.kind === 'image' && layer.payload.radius === 0
  })
  await browser.keys('Escape')
  await waitForStableCanvas()
  const square = await settledPixels()
  const squareImage = (await selectionDocument()).layers.find((item) => item.id === image.id) as ImageLayer
  const corners = await browser.execute((layer) => {
    const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const state = window as unknown as {
      __cuteScreenE2eQuick?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eM05?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eM08?: { snapshot(): { document: EditorDocumentV1 } }
    }
    const doc = state.__cuteScreenE2eQuick?.snapshot()
      ?? state.__cuteScreenE2eM08?.snapshot().document
      ?? state.__cuteScreenE2eM05!.snapshot()
    const out = document.querySelector('.cs-quick-actions') ? { x: 0, y: 0, ...doc.canvas }
      : doc.crop ?? { x: 0, y: 0, ...doc.canvas }
    const t = layer.transform, b = layer.localBounds!, half = layer.payload.border!.width / 2
    const context = canvas.getContext('2d')!
    const result: number[][] = []
    for (const x of [b.x - half, b.x + b.width + half]) {
      for (const y of [b.y - half, b.y + b.height + half]) {
        const px = (t.translateX + x * t.scaleX - out.x) * canvas.width / out.width
        const py = (t.translateY + y * t.scaleY - out.y) * canvas.height / out.height
        const insetX = x < b.x ? 1 : -2, insetY = y < b.y ? 1 : -2
        result.push([...context.getImageData(Math.floor(px + insetX), Math.floor(py + insetY), 1, 1).data])
      }
    }
    return result
  }, squareImage)
  const color = squareImage.payload.border!.color
  for (const corner of corners) {
    for (const [index, channel] of [color.red, color.green, color.blue, color.alpha].entries()) {
      expect(Math.abs(corner[index]! - Math.round(channel * 255))).toBeLessThanOrEqual(1)
    }
  }
  await browser.saveScreenshot(`${output}-radius-zero.png`)
  await browser.keys(['Control', 'z'])
  await browser.waitUntil(async () => {
    const layer = (await selectionDocument()).layers.find((item) => item.id === image.id)
    return layer?.kind === 'image' && layer.payload.radius === radiusValue
  })
  await browser.keys(['Control', 'Shift', 'z'])
  await browser.waitUntil(async () => samePixels(square, await pixels()))
  await browser.keys(['Control', 'z'])
  await browser.keys(['Control', 'z'])
  await browser.keys(['Control', 'z'])
  await browser.waitUntil(async () => samePixels(initial, await pixels()))
  expect((await selectionDocument()).layers).toEqual(original.layers)
}
