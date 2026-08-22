import path from 'node:path'

import { $, $$, browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'

type M08Layer = {
  readonly id: string
  readonly kind: string
  readonly locked: boolean
  readonly payload: Record<string, unknown>
  readonly localBounds: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  readonly transform: {
    readonly translateX: number
    readonly translateY: number
    readonly rotation: number
    readonly scaleX: number
    readonly scaleY: number
  }
}

function transformedLayerPoint(
  layer: M08Layer,
  point: Readonly<{ readonly x: number; readonly y: number }>,
): Readonly<{ readonly x: number; readonly y: number }> {
  const radians = (layer.transform.rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return {
    x:
      point.x * layer.transform.scaleX * cosine -
      point.y * layer.transform.scaleY * sine +
      layer.transform.translateX,
    y:
      point.x * layer.transform.scaleX * sine +
      point.y * layer.transform.scaleY * cosine +
      layer.transform.translateY,
  }
}

type M08HarnessSnapshot = {
  readonly document: {
    readonly canvas: { readonly width: number; readonly height: number }
    readonly crop: {
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
    } | null
    readonly layers: readonly M08Layer[]
  }
  readonly decodedSource?: { readonly width: number; readonly height: number }
  readonly clipboardText?: string
}

const baseId = '019c1f62-058e-7000-8000-000000000101'
const frontId = '019c1f62-058e-7000-8000-000000000104'

async function m08Snapshot(): Promise<M08HarnessSnapshot> {
  return browser.execute(() => {
    const harness = (
      window as typeof window & {
        __cuteScreenE2eM08?: {
          snapshot(): M08HarnessSnapshot | undefined
        }
      }
    ).__cuteScreenE2eM08
    const snapshot = harness?.snapshot()
    if (!snapshot) throw new Error('M08 harness is not ready')
    return snapshot
  })
}

async function readHarnessClipboard(): Promise<string | undefined> {
  return browser.execute(async () => {
    const harness = (
      window as typeof window & {
        __cuteScreenE2eM08?: {
          readClipboardText(): Promise<string | undefined>
        }
      }
    ).__cuteScreenE2eM08
    if (!harness) throw new Error('M08 clipboard harness is not ready')
    return harness.readClipboardText()
  })
}

async function m08VersionToken(): Promise<number> {
  return browser.execute(() => {
    const token = (
      window as typeof window & {
        __cuteScreenE2eM05?: { versionToken(): number | undefined }
      }
    ).__cuteScreenE2eM05?.versionToken()
    if (token === undefined) throw new Error('M08 version token is unavailable')
    return token
  })
}

async function recentColourHex(): Promise<string | undefined> {
  return browser.execute(() => {
    const raw = window.localStorage.getItem(
      'cute-screen.drawing-tool-preferences.v1',
    )
    if (!raw) return undefined
    const recent = (
      JSON.parse(raw) as {
        recentColors?: readonly {
          red: number
          green: number
          blue: number
        }[]
      }
    ).recentColors?.[0]
    if (!recent) return undefined
    return `#${[recent.red, recent.green, recent.blue]
      .map((channel) =>
        Math.round(channel * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()}`
  })
}

async function openM08(
  options: {
    readonly notReady?: boolean
    readonly clipboardError?: boolean
    readonly alpha?: 0 | 128 | 255
  } = {},
): Promise<void> {
  await browser.url('/')
  await browser.execute(() => window.localStorage.clear())
  const query = new URLSearchParams({ m05: '1', m08: '1' })
  if (options.notReady) query.set('m08notready', '1')
  if (options.clipboardError) query.set('m08clipboarderror', '1')
  if (options.alpha !== undefined) query.set('m08alpha', String(options.alpha))
  await browser.url(`/?${query.toString()}`)
  await expect($('.cs-canvas-ready')).toExist()
  await browser.waitUntil(async () => {
    const snapshot = await m08Snapshot()
    return snapshot.document.canvas.width === 400
  })
}

async function setLocale(locale: 'en' | 'ru'): Promise<void> {
  const current = await browser.execute(() => document.documentElement.lang)
  if (current === locale) return
  await $(
    `button[aria-label="${current === 'ru' ? 'Другие действия' : 'More actions'}"]`,
  ).click()
  await $(`button=${locale === 'ru' ? 'RU' : 'EN'}`).click()
  await browser.waitUntil(
    async () =>
      (await browser.execute(() => document.documentElement.lang)) === locale,
  )
}

async function chooseOption(label: string, option: string): Promise<void> {
  await browser.execute((name) => {
    const target = [
      ...document.querySelectorAll<HTMLElement>('[role="combobox"]'),
    ].find((element) => element.getAttribute('aria-label') === name)
    if (!target) throw new Error(`Missing combobox: ${name}`)
    target.click()
  }, label)
  await browser.waitUntil(() =>
    browser.execute(
      (name) =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '.cs-overlay-root [role="option"]',
          ),
        ].some((element) => element.textContent?.trim() === name),
      option,
    ),
  )
  await browser.execute((name) => {
    const target = [
      ...document.querySelectorAll<HTMLElement>(
        '.cs-overlay-root [role="option"]',
      ),
    ].find((element) => element.textContent?.trim() === name)
    if (!target) throw new Error(`Missing option: ${name}`)
    target.click()
  }, option)
}

async function canvasPoint(
  x: number,
  y: number,
): Promise<
  Readonly<{ x: number; y: number; canvasX: number; canvasY: number }>
> {
  return browser.execute(
    ({ canvasX, canvasY }) => {
      const scene = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas:not(.cs-canvas-overlay)',
      )
      if (!scene) throw new Error('Scene canvas is missing')
      const bounds = scene.getBoundingClientRect()
      const clientX = Math.round(
        bounds.left + (canvasX / scene.width) * bounds.width,
      )
      const clientY = Math.round(
        bounds.top + (canvasY / scene.height) * bounds.height,
      )
      return {
        x: clientX,
        y: clientY,
        canvasX: ((clientX - bounds.left) * scene.width) / bounds.width,
        canvasY: ((clientY - bounds.top) * scene.height) / bounds.height,
      }
    },
    { canvasX: x, canvasY: y },
  )
}

async function dragCanvas(
  start: Readonly<{ x: number; y: number }>,
  end: Readonly<{ x: number; y: number }>,
  id: string,
): Promise<
  Readonly<{
    start: Readonly<{ canvasX: number; canvasY: number }>
    end: Readonly<{ canvasX: number; canvasY: number }>
  }>
> {
  const from = await canvasPoint(start.x, start.y)
  const to = await canvasPoint(end.x, end.y)
  await browser
    .action('pointer', { id })
    .move({ origin: 'viewport', x: from.x, y: from.y, duration: 0 })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: to.x, y: to.y, duration: 80 })
    .up({ button: 'left' })
    .perform()
  return { start: from, end: to }
}

async function overlayStats(): Promise<{
  readonly dimPixels: number
  readonly whitePixels: number
  readonly whiteBounds?: {
    readonly minX: number
    readonly maxX: number
    readonly minY: number
    readonly maxY: number
  }
  readonly maxWarmRow: number
  readonly maxWarmColumn: number
}> {
  return browser.execute(() => {
    const overlay = document.querySelector<HTMLCanvasElement>(
      '.cs-canvas-overlay[aria-label="Interaction overlay"]',
    )
    if (!overlay) throw new Error('Interaction overlay is missing')
    const context = overlay.getContext('2d')
    if (!context) throw new Error('Interaction overlay context is missing')
    const data = context.getImageData(0, 0, overlay.width, overlay.height).data
    const rows = new Array<number>(overlay.height).fill(0)
    const columns = new Array<number>(overlay.width).fill(0)
    let dimPixels = 0
    let whitePixels = 0
    let minX = overlay.width
    let maxX = -1
    let minY = overlay.height
    let maxY = -1
    for (let y = 0; y < overlay.height; y += 1) {
      for (let x = 0; x < overlay.width; x += 1) {
        const offset = (y * overlay.width + x) * 4
        const red = data[offset] ?? 0
        const green = data[offset + 1] ?? 0
        const blue = data[offset + 2] ?? 0
        const alpha = data[offset + 3] ?? 0
        if (alpha > 80 && red < 80 && green < 90 && blue < 110) dimPixels += 1
        if (alpha > 20 && red > 225 && green > 225 && blue > 225) {
          whitePixels += 1
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        }
        if (
          alpha > 40 &&
          red > 160 &&
          green > 65 &&
          green < 170 &&
          blue < 125
        ) {
          rows[y] = (rows[y] ?? 0) + 1
          columns[x] = (columns[x] ?? 0) + 1
        }
      }
    }
    return {
      dimPixels,
      whitePixels,
      ...(maxX >= 0 ? { whiteBounds: { minX, maxX, minY, maxY } } : {}),
      maxWarmRow: Math.max(0, ...rows),
      maxWarmColumn: Math.max(0, ...columns),
    }
  })
}

async function overlayImage(): Promise<string> {
  return browser.execute(() => {
    const overlay = document.querySelector<HTMLCanvasElement>(
      '.cs-canvas-overlay[aria-label="Interaction overlay"]',
    )
    if (!overlay) throw new Error('Interaction overlay is missing')
    return overlay.toDataURL()
  })
}

async function overlayAlphaBounds(): Promise<
  | Readonly<{
      minX: number
      minY: number
      maxX: number
      maxY: number
      width: number
      height: number
    }>
  | undefined
> {
  return browser.execute(() => {
    const overlay = document.querySelector<HTMLCanvasElement>(
      '.cs-canvas-overlay[aria-label="Interaction overlay"]',
    )
    const context = overlay?.getContext('2d')
    if (!overlay || !context) throw new Error('Interaction overlay is missing')
    const pixels = context.getImageData(
      0,
      0,
      overlay.width,
      overlay.height,
    ).data
    let minX = overlay.width
    let minY = overlay.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < overlay.height; y += 1) {
      for (let x = 0; x < overlay.width; x += 1) {
        if ((pixels[(y * overlay.width + x) * 4 + 3] ?? 0) <= 10) continue
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
    return maxX < 0
      ? undefined
      : {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        }
  })
}

async function clickHistory(label: 'Undo' | 'Redo'): Promise<void> {
  const button = $(`button[aria-label="${label}"]`)
  await expect(button).toBeEnabled()
  await button.click()
}

async function clickSliderProgress(
  label: string,
  progress: number,
  pointerId: string,
): Promise<void> {
  const slider = $(`[role="slider"][aria-label="${label}"]`)
  await expect(slider).toExist()
  const geometry = await browser.execute(
    (accessibleLabel, nextProgress) => {
      const handle = document.querySelector<HTMLElement>(
        `[role="slider"][aria-label="${accessibleLabel}"]`,
      )
      const rail = handle?.closest<HTMLElement>('.n-slider')
      if (!handle || !rail)
        throw new Error(`Slider ${accessibleLabel} is missing`)
      const handleBounds = handle.getBoundingClientRect()
      const railBounds = rail.getBoundingClientRect()
      return {
        startX: Math.round(handleBounds.left + handleBounds.width / 2),
        startY: Math.round(handleBounds.top + handleBounds.height / 2),
        endX: Math.round(railBounds.left + railBounds.width * nextProgress),
      }
    },
    label,
    progress,
  )
  await browser
    .action('pointer', { id: pointerId })
    .move({
      origin: 'viewport',
      x: geometry.startX,
      y: geometry.startY,
      duration: 0,
    })
    .down({ button: 'left' })
    .move({
      origin: 'viewport',
      x: geometry.endX,
      y: geometry.startY,
      duration: 80,
    })
    .up({ button: 'left' })
    .perform()
}

async function drawPrecisionTool(
  label: string,
  kind: string,
  index: number,
): Promise<void> {
  const before = (await m08Snapshot()).document.layers.length
  const tool = $(`button[aria-label="${label}"]`)
  await tool.click()
  await expect(tool).toHaveAttribute('aria-pressed', 'true')
  const start = { x: 130 + index * 8, y: 110 + index * 10 }
  const end = { x: 230 + index * 8, y: 180 + index * 8 }
  await dragCanvas(start, end, `m08-${kind}`)
  // Chrome can drop the first synthesized drag while focus leaves the toolbar;
  // retry with another real pointer sequence, while the exact count below still
  // fails if both gestures commit.
  if ((await m08Snapshot()).document.layers.length === before) {
    await dragCanvas(start, end, `m08-${kind}-retry`)
  }
  await browser.waitUntil(
    async () => (await m08Snapshot()).document.layers.length === before + 1,
  )
  expect((await m08Snapshot()).document.layers.at(-1)?.kind).toBe(kind)
  await expect(tool).toHaveAttribute('aria-pressed', 'true')
}

describe('M08 crop and precision acceptance in browser mode', () => {
  it('crops from canvas dimensions after a user-resized and deleted base layer and across flips', async () => {
    await browser.setWindowSize(1280, 800)
    await openM08()
    const mounted = await m08Snapshot()
    expect(mounted.document.canvas).toEqual({ width: 400, height: 300 })
    expect(mounted.decodedSource).toEqual({ width: 400, height: 300 })

    await $('button[aria-label="Show layers"]').click()
    const baseRow = $(`[data-layer-id="${baseId}"]`)
    await baseRow.$('button[aria-label="Unlock layer"]').click()
    await baseRow.$('.cs-layer-select').click()
    await dragCanvas({ x: 399, y: 299 }, { x: 300, y: 225 }, 'm08-base-resize')
    await browser.waitUntil(async () => {
      const base = (await m08Snapshot()).document.layers.find(
        (layer) => layer.id === baseId,
      )
      return Boolean(base && base.transform.scaleX < 0.9)
    })
    expect((await m08Snapshot()).document.canvas).toEqual({
      width: 400,
      height: 300,
    })

    const cropTool = $('button[aria-label="Crop"]')
    await cropTool.click()
    await expect(cropTool).toHaveAttribute('aria-pressed', 'true')
    expect(
      await browser.execute(() =>
        document.activeElement?.getAttribute('aria-label'),
      ),
    ).toBe('Scene canvas')
    const full = await overlayStats()
    expect(full.whitePixels).toBeGreaterThan(50)
    expect(full.dimPixels).toBe(0)

    await chooseOption('Preset', '1:1')
    const square = await overlayStats()
    expect(square.dimPixels).toBeGreaterThan(10_000)
    expect(square.whiteBounds?.minX).toBeGreaterThanOrEqual(44)
    expect(square.whiteBounds?.maxX).toBeLessThanOrEqual(356)

    await $('button=Reset').click()
    await chooseOption('Preset', '4:3')
    expect((await overlayStats()).dimPixels).toBe(0)
    await $('button=Reset').click()
    await chooseOption('Preset', 'Original')
    expect((await overlayStats()).dimPixels).toBe(0)
    await $('button=Reset').click()
    await chooseOption('Preset', '16:9')
    const widescreen = await overlayStats()
    expect(widescreen.dimPixels).toBeGreaterThan(20_000)
    expect(widescreen.whiteBounds?.minY).toBeGreaterThanOrEqual(31)
    expect(widescreen.whiteBounds?.maxY).toBeLessThanOrEqual(269)

    await chooseOption('Preset', '1:1')
    await dragCanvas(
      { x: 350, y: 150 },
      { x: 320, y: 150 },
      'm08-crop-east-handle',
    )
    expect((await overlayStats()).dimPixels).toBeGreaterThan(square.dimPixels)
    await $('button=Reset').click()
    expect((await overlayStats()).dimPixels).toBe(0)
    await chooseOption('Preset', '16:9')
    await browser.keys('Escape')
    expect((await m08Snapshot()).document.crop).toBeNull()
    await expect($('button[aria-label="Select"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await cropTool.click()
    await chooseOption('Preset', '1:1')
    await browser.keys([Key.Shift, 'ArrowRight'])
    await browser.keys('Enter')
    await browser.waitUntil(async () =>
      Boolean((await m08Snapshot()).document.crop),
    )
    expect((await m08Snapshot()).document.crop).toEqual({
      x: 60,
      y: 0,
      width: 300,
      height: 300,
    })
    await clickHistory('Undo')
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.crop === null,
    )

    const restoredBaseRow = $(`[data-layer-id="${baseId}"]`)
    if (!(await restoredBaseRow.isExisting())) {
      await $('button[aria-label="Show layers"]').click()
    }
    await $(`[data-layer-id="${baseId}"]`).$('.cs-layer-select').click()
    await browser.keys('Delete')
    await browser.waitUntil(async () =>
      (await m08Snapshot()).document.layers.every(
        (layer) => layer.id !== baseId,
      ),
    )
    expect((await m08Snapshot()).document.canvas).toEqual({
      width: 400,
      height: 300,
    })

    await $('button[aria-label="Select"]').click()
    await $('button=Flip vertically').click()
    await cropTool.click()
    await chooseOption('Preset', '1:1')
    await browser.keys([Key.Shift, 'ArrowRight'])
    await $('button=Apply').click()
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.crop?.x === 60,
    )
    await $('button[aria-label="Select"]').click()
    await $('button=Flip horizontally').click()
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.crop?.x === 40,
    )
    await clickHistory('Undo')
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.crop?.x === 60,
    )
    await clickHistory('Redo')
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.crop?.x === 40,
    )
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m08-crop-resized-deleted-base.png'),
    )
  })

  it('maps new precision and text gestures through an applied non-origin crop', async () => {
    await browser.setWindowSize(1280, 800)
    await openM08()

    const cropTool = $('button[aria-label="Crop"]')
    await cropTool.click()
    await chooseOption('Preset', '1:1')
    await browser.keys([Key.Shift, 'ArrowRight'])
    await browser.keys('Enter')
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.crop?.x === 60,
    )
    expect((await m08Snapshot()).document.crop).toEqual({
      x: 60,
      y: 0,
      width: 300,
      height: 300,
    })
    await $('button[aria-label="Select"]').click()
    const croppedSurface = await browser.execute(() => {
      const scene = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas:not(.cs-canvas-overlay)',
      )
      const surface = document.querySelector<HTMLElement>('.cs-canvas-surface')
      if (!scene || !surface)
        throw new Error('Cropped canvas surface is missing')
      const bounds = surface.getBoundingClientRect()
      return {
        intrinsicWidth: scene.width,
        intrinsicHeight: scene.height,
        cssWidth: bounds.width,
        cssHeight: bounds.height,
      }
    })
    expect(croppedSurface.intrinsicWidth).toBe(300)
    expect(croppedSurface.intrinsicHeight).toBe(300)
    expect(croppedSurface.cssWidth / croppedSurface.cssHeight).toBeCloseTo(1, 4)

    await $('button[aria-label="Hide data"]').click()
    const censorGesture = await dragCanvas(
      { x: 30, y: 30 },
      { x: 120, y: 100 },
      'm08-cropped-censor',
    )
    await browser.waitUntil(
      async () =>
        (await m08Snapshot()).document.layers.at(-1)?.kind === 'censor',
    )
    const censor = (await m08Snapshot()).document.layers.at(-1)!
    expect(censor.payload).toMatchObject({ region: { kind: 'rectangle' } })
    expect(censor.transform.translateX).toBeCloseTo(
      60 + censorGesture.start.canvasX,
      5,
    )
    expect(censor.transform.translateY).toBeCloseTo(
      censorGesture.start.canvasY,
      5,
    )
    expect(censor.localBounds.width).toBeCloseTo(
      censorGesture.end.canvasX - censorGesture.start.canvasX,
      5,
    )
    expect(censor.localBounds.height).toBeCloseTo(
      censorGesture.end.canvasY - censorGesture.start.canvasY,
      5,
    )

    await $('button[aria-label="Ruler"]').click()
    const rulerGesture = await dragCanvas(
      { x: 10, y: 200 },
      { x: 210, y: 200 },
      'm08-cropped-ruler',
    )
    await browser.waitUntil(
      async () =>
        (await m08Snapshot()).document.layers.at(-1)?.kind === 'ruler',
    )
    const ruler = (await m08Snapshot()).document.layers.at(-1)!
    const rulerStart = ruler.payload.start as {
      readonly x: number
      readonly y: number
    }
    const rulerEnd = ruler.payload.end as {
      readonly x: number
      readonly y: number
    }
    expect(ruler.transform.translateX + rulerStart.x).toBeCloseTo(
      60 + rulerGesture.start.canvasX,
      5,
    )
    expect(ruler.transform.translateY + rulerStart.y).toBeCloseTo(
      rulerGesture.start.canvasY,
      5,
    )
    expect(ruler.transform.translateX + rulerEnd.x).toBeCloseTo(
      60 + rulerGesture.end.canvasX,
      5,
    )
    expect(ruler.transform.translateY + rulerEnd.y).toBeCloseTo(
      rulerGesture.end.canvasY,
      5,
    )

    await $('button[aria-label="Eyedropper"]').click()
    const sample = await canvasPoint(20, 20)
    await browser
      .action('pointer', { id: 'm08-cropped-eyedropper' })
      .move({ origin: 'viewport', x: sample.x, y: sample.y, duration: 0 })
      .down({ button: 'left' })
      .up({ button: 'left' })
      .perform()
    await expect($('.cs-eyedropper-feedback')).toHaveText(
      'Colour selected: #273D5A',
    )

    await $('button[aria-label="Text"]').click()
    const textGesture = await dragCanvas(
      { x: 150, y: 120 },
      { x: 230, y: 120 },
      'm08-cropped-text',
    )
    const editor = $('[contenteditable="true"][aria-label="Text editor"]')
    await expect(editor).toExist()
    await editor.addValue('Cropped')
    await browser.keys(['Control', 'Enter'])
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.layers.at(-1)?.kind === 'text',
    )
    const createdText = (await m08Snapshot()).document.layers.at(-1)!
    expect(createdText.transform.translateX).toBeCloseTo(
      60 + textGesture.start.canvasX,
      5,
    )
    expect(createdText.transform.translateY).toBeCloseTo(
      textGesture.start.canvasY,
      5,
    )

    await $('button[aria-label="Show layers"]').click()
    await $('button[aria-label="Select"]').click()
    await $(`[data-layer-id="${createdText.id}"] .cs-layer-select`).click()
    const textContentBefore = createdText.payload.content as {
      readonly spans: readonly unknown[]
    }
    const resizeStart = {
      x:
        createdText.transform.translateX +
        createdText.localBounds.x +
        createdText.localBounds.width -
        60,
      y:
        createdText.transform.translateY +
        createdText.localBounds.y +
        createdText.localBounds.height / 2,
    }
    const versionBeforeResize = await m08VersionToken()
    await dragCanvas(
      resizeStart,
      { x: resizeStart.x - 40, y: resizeStart.y },
      'm08-cropped-text-width-resize',
    )
    await browser.waitUntil(
      async () => (await m08VersionToken()) === versionBeforeResize + 1,
    )
    const resizedText = (await m08Snapshot()).document.layers.find(
      (candidate) => candidate.id === createdText.id,
    )!
    const resizedContent = resizedText.payload.content as {
      readonly wrap: string
      readonly fixedWidth: number
      readonly spans: readonly unknown[]
    }
    expect(resizedContent.wrap).toBe('fixedWidth')
    expect(resizedContent.fixedWidth).toBeLessThan(
      createdText.localBounds.width,
    )
    expect(resizedContent.spans).toEqual(textContentBefore.spans)
    expect(resizedText.localBounds.height).toBeGreaterThan(
      createdText.localBounds.height,
    )
    expect(resizedText.transform.scaleX).toBe(1)
    expect(resizedText.transform.scaleY).toBe(1)
  })

  it('keeps every M08 contextual setting labelled and inside desktop and 1024px RU/EN layouts', async () => {
    const matrix = [
      { width: 1440, height: 900 },
      { width: 1024, height: 700 },
    ] as const
    const tools = {
      en: [
        ['Crop', ['Preset', 'Reset', 'Apply', 'Cancel']],
        ['Hide data', ['Region', 'Effect', 'Block size']],
        ['Spotlight', ['Shape', 'Dim color', 'Dim opacity', 'Feather']],
        [
          'Ruler',
          [
            'Colour',
            'Thickness',
            'Label size',
            'Unit',
            'Snapping',
            'Angle step',
          ],
        ],
        [
          'Loupe',
          ['Zoom', 'Size', 'Shape', 'Border color', 'Border width', 'Shadow'],
        ],
      ],
      ru: [
        ['Обрезка', ['Пропорции', 'Сбросить', 'Применить', 'Отмена']],
        ['Скрыть данные', ['Область', 'Эффект', 'Размер блока']],
        [
          'Фонарь',
          [
            'Форма',
            'Цвет затемнения',
            'Непрозрачность затемнения',
            'Растушёвка',
          ],
        ],
        [
          'Линейка',
          [
            'Цвет',
            'Толщина',
            'Размер подписи',
            'Единицы',
            'Привязка',
            'Шаг угла',
          ],
        ],
        [
          'Лупа',
          [
            'Увеличение',
            'Размер',
            'Форма',
            'Цвет рамки',
            'Толщина рамки',
            'Тень',
          ],
        ],
      ],
    } as const

    for (const size of matrix) {
      await browser.setWindowSize(size.width, size.height)
      await openM08()
      for (const locale of ['en', 'ru'] as const) {
        await setLocale(locale)
        for (const [tool, labels] of tools[locale]) {
          await $(`button[aria-label="${tool}"]`).click()
          const layout = await browser.execute((expectedLabels) => {
            const toolbar = document.querySelector<HTMLElement>(
              '.cs-context-toolbar',
            )
            const controls = document.querySelector<HTMLElement>(
              '.cs-context-controls',
            )
            if (!toolbar || !controls) throw new Error('M08 toolbar is missing')
            const toolbarBounds = toolbar.getBoundingClientRect()
            const text = toolbar.textContent ?? ''
            return {
              labelsVisible: expectedLabels.every((label) =>
                text.includes(label),
              ),
              toolbarFits:
                toolbarBounds.left >= 0 &&
                toolbarBounds.right <= window.innerWidth &&
                toolbarBounds.top >= 0 &&
                toolbarBounds.bottom <= window.innerHeight,
              controlsFit: controls.scrollWidth <= controls.clientWidth,
              documentFits:
                document.documentElement.scrollWidth <= window.innerWidth,
              activeElement: document.activeElement?.getAttribute('aria-label'),
            }
          }, labels)
          expect({ size, locale, tool, ...layout }).toEqual({
            size,
            locale,
            tool,
            labelsVisible: true,
            toolbarFits: true,
            controlsFit: true,
            documentFits: true,
            activeElement: locale === 'ru' ? 'Холст сцены' : 'Scene canvas',
          })
        }
        await browser.saveScreenshot(
          path.resolve(
            `artifacts/browser-e2e/m08-toolbar-${size.width}x${size.height}-${locale}.png`,
          ),
        )
      }
    }
  })

  it('creates precision layers with loupe-only auto-selection and preserves active tools', async () => {
    await browser.setWindowSize(1280, 800)
    await openM08()
    await $('button[aria-label="Show layers"]').click()

    for (const [index, label, kind] of [
      [0, 'Hide data', 'censor'],
      [1, 'Spotlight', 'spotlight'],
      [2, 'Ruler', 'ruler'],
    ] as const) {
      await drawPrecisionTool(label, kind, index)
      expect(await $$('.cs-layer-row.is-selected')).toHaveLength(0)
      if (kind === 'ruler') {
        await browser.saveScreenshot(
          path.resolve('artifacts/browser-e2e/m08-ruler-visual.png'),
        )
      }
    }

    const beforeCancel = (await m08Snapshot()).document.layers.length
    const start = await canvasPoint(280, 40)
    const end = await canvasPoint(330, 80)
    await browser
      .action('pointer', { id: 'm08-cancel-censor' })
      .move({ origin: 'viewport', x: start.x, y: start.y, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'viewport', x: end.x, y: end.y, duration: 40 })
      .cancel()
      .perform()
    expect((await m08Snapshot()).document.layers).toHaveLength(beforeCancel)

    await drawPrecisionTool('Loupe', 'loupe', 3)
    const selected = await $$('.cs-layer-row.is-selected')
    expect(selected).toHaveLength(1)
    await expect(selected[0]!).toHaveAttribute('data-layer-id')
    await expect($('button[aria-label="Loupe"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('keeps locked precision controls unfocusable and history/default neutral, then commits one update after unlock', async () => {
    await browser.setWindowSize(1280, 800)
    await openM08()
    await $('button[aria-label="Show layers"]').click()
    await drawPrecisionTool('Hide data', 'censor', 0)
    const created = (await m08Snapshot()).document.layers.at(-1)
    if (!created || created.kind !== 'censor') {
      throw new Error('expected censor')
    }
    const row = $(`[data-layer-id="${created.id}"]`)
    await row.$('.cs-layer-select').click()
    await row.$('button[aria-label="Lock layer"]').click()
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.layers.at(-1)?.locked === true,
    )

    const effect = $('[role="combobox"][aria-label="Effect"]')
    const blockSize = $('[role="slider"][aria-label="Block size"]')
    await expect(effect).toHaveAttribute('aria-disabled', 'true')
    await expect(blockSize).toHaveAttribute('aria-disabled', 'true')
    const before = await m08Snapshot()
    const versionBefore = await m08VersionToken()
    const disabledFocusState = await browser.execute(() => {
      const target = [
        ...document.querySelectorAll<HTMLElement>('[role="combobox"]'),
      ].find((element) => element.getAttribute('aria-label') === 'Effect')
      if (!target) throw new Error('Effect control is missing')
      target.focus()
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          bubbles: true,
          cancelable: true,
        }),
      )
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      )
      target.click()
      return {
        focused: document.activeElement === target,
        tabIndex: target.getAttribute('tabindex'),
      }
    })
    expect(disabledFocusState.tabIndex).toBe('-1')
    expect(await m08VersionToken()).toBe(versionBefore)
    expect((await m08Snapshot()).document).toEqual(before.document)
    expect(await recentColourHex()).toBeUndefined()

    await $(`[data-layer-id="${baseId}"] .cs-layer-select`).click()
    await expect(effect).toHaveText('Pixelate')
    await row.$('.cs-layer-select').click()
    await row.$('button[aria-label="Unlock layer"]').click()
    await browser.waitUntil(
      async () =>
        (await m08Snapshot()).document.layers.at(-1)?.locked === false,
    )
    const versionAfterUnlock = await m08VersionToken()
    await chooseOption('Effect', 'Blur')
    await browser.waitUntil(
      async () =>
        (await m08Snapshot()).document.layers.at(-1)?.payload.effect &&
        (
          (await m08Snapshot()).document.layers.at(-1)?.payload.effect as {
            mode?: string
          }
        ).mode === 'blur',
    )
    expect(await m08VersionToken()).toBe(versionAfterUnlock + 1)
  })

  it('keeps the ruler frame and badge hittable through style growth and intrinsic endpoint resize with undo/redo', async () => {
    await browser.setWindowSize(1280, 800)
    await openM08()
    await $('button[aria-label="Show layers"]').click()
    await drawPrecisionTool('Ruler', 'ruler', 0)
    const created = (await m08Snapshot()).document.layers.at(-1)
    if (!created || created.kind !== 'ruler') throw new Error('expected ruler')
    await $(`[data-layer-id="${created.id}"] .cs-layer-select`).click()
    await browser.waitUntil(async () => Boolean(await overlayAlphaBounds()))
    const initialFrame = await overlayAlphaBounds()

    await clickSliderProgress('Label size', 0.95, 'm08-ruler-font-size')
    await browser.waitUntil(async () => {
      const ruler = (await m08Snapshot()).document.layers.at(-1)
      return Number(ruler?.payload.fontSize) > 14
    })
    const afterFont = (await m08Snapshot()).document.layers.at(-1)!
    const fontFrame = await overlayAlphaBounds()
    expect(
      afterFont.localBounds.width > created.localBounds.width ||
        afterFont.localBounds.height > created.localBounds.height,
    ).toBe(true)
    expect(
      (fontFrame?.width ?? 0) > (initialFrame?.width ?? 0) ||
        (fontFrame?.height ?? 0) > (initialFrame?.height ?? 0),
    ).toBe(true)

    await clickSliderProgress('Thickness', 0.95, 'm08-ruler-thickness')
    await browser.waitUntil(async () => {
      const ruler = (await m08Snapshot()).document.layers.at(-1)
      return Number(ruler?.payload.thickness) > 6
    })
    const afterThickness = (await m08Snapshot()).document.layers.at(-1)!
    expect(
      afterThickness.localBounds.width > afterFont.localBounds.width ||
        afterThickness.localBounds.height > afterFont.localBounds.height,
    ).toBe(true)

    await clickHistory('Undo')
    expect((await m08Snapshot()).document.layers.at(-1)?.payload).toMatchObject(
      {
        thickness: 2,
        fontSize: afterFont.payload.fontSize,
      },
    )
    await clickHistory('Undo')
    expect((await m08Snapshot()).document.layers.at(-1)?.localBounds).toEqual(
      created.localBounds,
    )
    await clickHistory('Redo')
    await clickHistory('Redo')
    expect((await m08Snapshot()).document.layers.at(-1)?.localBounds).toEqual(
      afterThickness.localBounds,
    )

    await $('button[aria-label="Select"]').click()
    const beforeResize = (await m08Snapshot()).document.layers.at(-1)!
    const payloadBefore = beforeResize.payload as {
      readonly start: { readonly x: number; readonly y: number }
      readonly end: { readonly x: number; readonly y: number }
      readonly thickness: number
      readonly fontSize: number
    }
    const fixedStart = transformedLayerPoint(beforeResize, payloadBefore.start)
    const resizeStart = transformedLayerPoint(beforeResize, payloadBefore.end)
    const resizeEnd = { x: resizeStart.x + 35, y: resizeStart.y + 24 }
    const versionBeforeResize = await m08VersionToken()
    await dragCanvas(resizeStart, resizeEnd, 'm08-ruler-endpoint-resize')
    await browser.waitUntil(
      async () => (await m08VersionToken()) === versionBeforeResize + 1,
    )
    expect(await m08VersionToken()).toBe(versionBeforeResize + 1)
    const afterResize = (await m08Snapshot()).document.layers.at(-1)!
    expect(afterResize.transform.scaleX).toBe(1)
    expect(afterResize.transform.scaleY).toBe(1)
    expect(afterResize.payload).toMatchObject({
      thickness: payloadBefore.thickness,
      fontSize: payloadBefore.fontSize,
    })
    const resizedFrame = await overlayAlphaBounds()
    expect(
      Math.max(resizedFrame?.width ?? 0, resizedFrame?.height ?? 0),
    ).toBeGreaterThan(50)
    expect(
      Math.min(resizedFrame?.width ?? 0, resizedFrame?.height ?? 0),
    ).toBeGreaterThan(16)

    const payloadAfter = afterResize.payload as typeof payloadBefore
    const actualEndpoints = [
      transformedLayerPoint(afterResize, payloadAfter.start),
      transformedLayerPoint(afterResize, payloadAfter.end),
    ] as const
    expect(actualEndpoints[0].x).toBeCloseTo(fixedStart.x, 5)
    expect(actualEndpoints[0].y).toBeCloseTo(fixedStart.y, 5)
    // WebDriver pointer coordinates are rounded through the zoomed CSS surface.
    expect(actualEndpoints[1].x).toBeCloseTo(resizeEnd.x, 0)
    expect(actualEndpoints[1].y).toBeCloseTo(resizeEnd.y, 0)

    await $(`[data-layer-id="${baseId}"] .cs-layer-select`).click()
    const [start, end] = actualEndpoints
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    const badgePoint = {
      x: (start.x + end.x) / 2 - ((end.y - start.y) / length) * 8,
      y: (start.y + end.y) / 2 + ((end.x - start.x) / length) * 8,
    }
    const badgeClientPoint = await canvasPoint(badgePoint.x, badgePoint.y)
    await browser
      .action('pointer', { id: 'm08-ruler-badge-hit' })
      .move({
        origin: 'viewport',
        x: badgeClientPoint.x,
        y: badgeClientPoint.y,
        duration: 0,
      })
      .down({ button: 'left' })
      .up({ button: 'left' })
      .perform()
    await expect($(`[data-layer-id="${afterResize.id}"]`)).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await clickHistory('Undo')
    expect((await m08Snapshot()).document.layers.at(-1)).toEqual(beforeResize)
    await clickHistory('Redo')
    expect((await m08Snapshot()).document.layers.at(-1)).toEqual(afterResize)
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m08-ruler-bounds-after-style.png'),
    )
  })

  it('shows guides only while held, clears them on release and blur, and never commits them', async () => {
    await browser.setWindowSize(1280, 800)
    await openM08()
    await $('button[aria-label="Show layers"]').click()
    await $(`[data-layer-id="${frontId}"] .cs-layer-select`).click()
    const before = await m08Snapshot()
    const sceneBefore = await browser.execute(() => {
      const scene = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas:not(.cs-canvas-overlay)',
      )
      if (!scene) throw new Error('Scene canvas is missing')
      return scene.toDataURL()
    })
    const start = await canvasPoint(70, 50)
    const next = await canvasPoint(71, 51)
    await browser
      .action('pointer', { id: 'm08-guide-pointer' })
      .move({ origin: 'viewport', x: start.x, y: start.y, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'viewport', x: next.x, y: next.y, duration: 40 })
      .perform(true)
    const withoutHold = await overlayImage()

    await browser
      .action('key', { id: 'm08-guide-key' })
      .down(Key.Alt)
      .perform(true)
    await browser.waitUntil(async () => (await overlayImage()) !== withoutHold)
    const held = await overlayImage()
    expect(held).not.toBe(withoutHold)

    await browser
      .action('key', { id: 'm08-guide-key' })
      .up(Key.Alt)
      .perform(true)
    await browser.waitUntil(async () => (await overlayImage()) === withoutHold)
    const released = await overlayImage()
    expect(released).toBe(withoutHold)

    await browser
      .action('key', { id: 'm08-guide-key-blur' })
      .down(Key.Alt)
      .perform(true)
    await browser.execute(() => window.dispatchEvent(new Event('blur')))
    await browser
      .action('key', { id: 'm08-guide-key-blur' })
      .up(Key.Alt)
      .perform()
    await browser.waitUntil(async () => (await overlayImage()) !== held)
    const blurred = await overlayImage()
    expect(blurred).not.toBe(held)
    expect((await m08Snapshot()).document).toEqual(before.document)
    expect(
      (await m08Snapshot()).document.layers.some((layer) =>
        layer.kind.toLowerCase().includes('guide'),
      ),
    ).toBe(false)
    await browser.waitUntil(
      async () =>
        (await browser.execute(() => {
          const scene = document.querySelector<HTMLCanvasElement>(
            '.cs-canvas:not(.cs-canvas-overlay)',
          )
          return scene?.toDataURL()
        })) === sceneBefore,
    )
  })

  it('samples a known scene pixel at zoom, excludes overlay, updates recent, and exposes cancel/error states', async () => {
    await browser.setWindowSize(1280, 800)
    await browser.url('/')
    await browser.execute(() => window.localStorage.clear())
    await browser.url('/')
    await expect($('button[aria-label="Eyedropper"]')).toBeDisabled()

    for (const alpha of [0, 128] as const) {
      await openM08({ alpha })
      await $('button[aria-label="Eyedropper"]').click()
      await expect($('.cs-eyedropper-loupe')).toBeDisplayed()
      await expect($('.cs-eyedropper-loupe')).toHaveAttribute(
        'data-state',
        'unavailable',
      )
      await browser.keys('Enter')
      await expect($('.cs-eyedropper-feedback')).toHaveText(
        'There is no opaque colour at this point',
      )
      await expect($('.cs-eyedropper-swatch')).not.toExist()
      expect(await readHarnessClipboard()).toBeUndefined()
      expect(await recentColourHex()).toBeUndefined()
    }

    await openM08({ alpha: 255 })
    await $('button[aria-label="Zoom in"]').click()
    await expect($('.cs-zoom-controls')).not.toHaveAttribute('data-zoom', '100')
    await $('button[aria-label="Eyedropper"]').click()
    await expect($('.cs-eyedropper-loupe')).toBeDisplayed()
    await expect($('.cs-eyedropper-loupe')).toHaveText(
      expect.stringContaining('#273D5A'),
    )
    await expect($('.cs-eyedropper-loupe canvas')).toHaveAttribute('width', '9')
    await expect($('.cs-eyedropper-loupe canvas')).toHaveAttribute(
      'height',
      '9',
    )
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m08-eyedropper-live-loupe-en.png'),
    )
    await expect($('.cs-eyedropper-loupe-target')).toBeDisplayed()
    await browser.keys([Key.Shift, 'ArrowRight'])
    await browser.keys('Enter')
    await expect($('.cs-eyedropper-feedback')).toHaveText(
      'Colour selected: #273D5A',
    )
    await expect($('[aria-label="Colour swatch #273D5A"]')).toExist()
    expect(await readHarnessClipboard()).toBe('#273D5A')
    expect(await recentColourHex()).toBe('#273D5A')

    await $('button[aria-label="Select"]').click()
    await $('button[aria-label="Eyedropper"]').click()
    const samplePoint = await canvasPoint(20, 250)
    await browser
      .action('pointer', { id: 'm08-eyedropper-cancel' })
      .move({
        origin: 'viewport',
        x: samplePoint.x,
        y: samplePoint.y,
        duration: 0,
      })
      .down({ button: 'right' })
      .up({ button: 'right' })
      .perform()
    await expect($('.cs-eyedropper-feedback')).toHaveText(
      'Colour sampling cancelled',
    )
    await $('button[aria-label="Select"]').click()
    await $('button[aria-label="Eyedropper"]').click()
    await browser.keys('Escape')
    await expect($('.cs-eyedropper-feedback')).toHaveText(
      'Colour sampling cancelled',
    )

    await openM08({ notReady: true })
    await $('button[aria-label="Eyedropper"]').click()
    await browser.keys('Enter')
    await expect($('.cs-eyedropper-feedback')).toHaveText(
      'Scene textures are still loading; try again when the canvas is ready',
    )

    await openM08({ clipboardError: true })
    await $('button[aria-label="Eyedropper"]').click()
    await browser.keys('Enter')
    await expect($('.cs-eyedropper-feedback')).toHaveText(
      'Colour selected: #273D5A. HEX could not be copied.',
    )
    await expect($('[aria-label="Colour swatch #273D5A"]')).toExist()
    expect(await recentColourHex()).toBe('#273D5A')

    await browser.setWindowSize(1024, 700)
    await openM08({ alpha: 255 })
    await setLocale('ru')
    await $('button[aria-label="Пипетка"]').click()
    await expect($('.cs-eyedropper-loupe')).toHaveText(
      expect.stringContaining('Нажмите, чтобы выбрать'),
    )
    await browser.saveScreenshot(
      path.resolve(
        'artifacts/browser-e2e/m08-eyedropper-live-loupe-1024-ru.png',
      ),
    )
  })
})
