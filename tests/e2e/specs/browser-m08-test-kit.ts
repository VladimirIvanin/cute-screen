import { $, browser, expect } from '@wdio/globals'

export type M08Layer = {
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

export function transformedLayerPoint(
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

export type M08HarnessSnapshot = {
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

export const baseId = '019c1f62-058e-7000-8000-000000000101'

export const frontId = '019c1f62-058e-7000-8000-000000000104'

export async function m08Snapshot(): Promise<M08HarnessSnapshot> {
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

export async function readHarnessClipboard(): Promise<string | undefined> {
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

export async function m08VersionToken(): Promise<number> {
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

export async function recentColourHex(): Promise<string | undefined> {
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

export async function openM08(
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

export async function setLocale(locale: 'en' | 'ru'): Promise<void> {
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

export async function chooseOption(
  label: string,
  option: string,
): Promise<void> {
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

export async function canvasPoint(
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

export async function dragCanvas(
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

export async function overlayStats(): Promise<{
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

export async function overlayImage(): Promise<string> {
  return browser.execute(() => {
    const overlay = document.querySelector<HTMLCanvasElement>(
      '.cs-canvas-overlay[aria-label="Interaction overlay"]',
    )
    if (!overlay) throw new Error('Interaction overlay is missing')
    return overlay.toDataURL()
  })
}

export async function overlayAlphaBounds(): Promise<
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

export async function clickHistory(label: 'Undo' | 'Redo'): Promise<void> {
  const button = $(`button[aria-label="${label}"]`)
  await expect(button).toBeEnabled()
  await button.click()
}

export async function clickSliderProgress(
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

export async function drawPrecisionTool(
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
