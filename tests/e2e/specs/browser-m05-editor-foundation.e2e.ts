import { $, browser, expect } from '@wdio/globals'
import path from 'node:path'
import { Key } from 'webdriverio'

type HarnessDocument = {
  readonly canvas: { readonly width: number; readonly height: number }
  readonly crop: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  } | null
  readonly layers: readonly {
    readonly id: string
    readonly locked: boolean
    readonly transform: {
      readonly translateX: number
      readonly translateY: number
    }
    readonly payload: { readonly blobHash?: string }
  }[]
}
const baseId = '019c1f62-058e-7000-8000-000000000101'
const frontId = '019c1f62-058e-7000-8000-000000000104'

async function snapshot(): Promise<HarnessDocument> {
  return browser.execute(() => {
    const harness = (
      window as typeof window & {
        __cuteScreenE2eM05?: { snapshot(): HarnessDocument | undefined }
      }
    ).__cuteScreenE2eM05
    const document = harness?.snapshot()
    if (!document) throw new Error('M05 harness document is not ready')
    return document
  })
}

async function openM05(viewportFixture = false): Promise<void> {
  await browser.url('/')
  await browser.execute(() => window.localStorage.clear())
  await browser.url(`/?m05=1${viewportFixture ? '&m05viewport=1' : ''}`)
  await expect($('.cs-canvas-ready')).toExist()
  await browser.waitUntil(async () => (await snapshot()).layers.length === 4)
  if (viewportFixture) {
    await browser.waitUntil(async () => {
      return (await $('.cs-zoom-controls').getAttribute('data-zoom')) !== '100'
    })
  }
}

async function viewportLayout() {
  return browser.execute(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) {
        throw new Error(`Missing viewport element: ${selector}`)
      }
      const bounds = element.getBoundingClientRect()
      return {
        width: bounds.width,
        height: bounds.height,
        top: bounds.top,
        bottom: bounds.bottom,
      }
    }
    const zoomText =
      document.querySelector('.cs-zoom-controls')?.getAttribute('data-zoom') ??
      ''
    const scene = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')
    if (!(scene instanceof HTMLCanvasElement)) {
      throw new Error('Missing scene canvas')
    }
    return {
      windowHeight: window.innerHeight,
      zoom: Number.parseInt(zoomText, 10),
      canvasWidth: scene.width,
      canvasHeight: scene.height,
      shell: rect('.cs-editor-shell'),
      viewport: rect('.cs-viewport'),
      surface: rect('.cs-canvas-surface'),
      zoomControls: rect('.cs-zoom-controls'),
    }
  })
}

async function waitForSurfaceSize(
  width: number,
  height: number,
): Promise<void> {
  await browser.waitUntil(async () => {
    const layout = await viewportLayout()
    return (
      Math.abs(layout.surface.width - width) < 0.5 &&
      Math.abs(layout.surface.height - height) < 0.5
    )
  })
}

async function canvasPoint(
  x: number,
  y: number,
): Promise<Readonly<{ x: number; y: number }>> {
  const harnessDocument = await snapshot()
  const outputX = harnessDocument.crop?.x ?? 0
  const outputY = harnessDocument.crop?.y ?? 0
  return browser.execute(
    ({ canvasX, canvasY, originX, originY }) => {
      const scene = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas:not(.cs-canvas-overlay)',
      )
      if (!scene) throw new Error('Scene canvas is missing')
      const bounds = scene.getBoundingClientRect()
      return {
        x: Math.round(
          bounds.left + ((canvasX - originX) / scene.width) * bounds.width,
        ),
        y: Math.round(
          bounds.top + ((canvasY - originY) / scene.height) * bounds.height,
        ),
      }
    },
    { canvasX: x, canvasY: y, originX: outputX, originY: outputY },
  )
}

/**
 * The document-session snapshot is published synchronously, while the toolbar
 * state is rendered by Vue on its next update.  Waiting for the control keeps
 * the test coupled to the user-visible contract instead of racing that update.
 */
async function clickEnabledHistoryAction(
  label: 'Undo' | 'Redo',
): Promise<void> {
  const action = $(`button[aria-label="${label}"]`)
  await expect(action).toBeEnabled()
  await action.click()
}

describe('M05 editor foundation in browser mode', () => {
  it('keeps the zoomed surface exact without resizing or clipping the editor shell', async () => {
    await browser.setWindowSize(1024, 700)
    await openM05(true)

    const fit = await viewportLayout()
    const mounted = await snapshot()
    const outputWidth = mounted.crop?.width ?? mounted.canvas.width
    const outputHeight = mounted.crop?.height ?? mounted.canvas.height
    expect(fit.surface.width).toBeCloseTo((outputWidth * fit.zoom) / 100, 0)
    expect(fit.surface.height).toBeCloseTo((outputHeight * fit.zoom) / 100, 0)
    expect(fit.shell.bottom).toBeLessThanOrEqual(fit.windowHeight + 1)
    expect(fit.zoomControls.bottom).toBeLessThanOrEqual(fit.viewport.bottom + 1)
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m05-viewport-fit-1024x700.png'),
    )

    await $('.cs-zoom-value').click()
    await expect($('.cs-zoom-controls')).toHaveAttribute('data-zoom', '100')
    await waitForSurfaceSize(outputWidth, outputHeight)
    const actualSize = await viewportLayout()
    expect(actualSize.surface.width).toBeCloseTo(outputWidth, 0)
    expect(actualSize.surface.height).toBeCloseTo(outputHeight, 0)
    expect(actualSize.viewport.height).toBeCloseTo(fit.viewport.height, 0)
    expect(actualSize.zoomControls.bottom).toBeLessThanOrEqual(
      actualSize.viewport.bottom + 1,
    )
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m05-viewport-100-1024x700.png'),
    )

    await $('button[aria-label="Fit canvas"]').click()
    await browser.waitUntil(async () => (await viewportLayout()).zoom !== 100)
    const refitZoom = (await viewportLayout()).zoom
    await waitForSurfaceSize(
      (outputWidth * refitZoom) / 100,
      (outputHeight * refitZoom) / 100,
    )
    const refit = await viewportLayout()
    expect(refit.surface.width).toBeCloseTo((outputWidth * refit.zoom) / 100, 0)
    expect(refit.surface.height).toBeCloseTo(
      (outputHeight * refit.zoom) / 100,
      0,
    )
    expect(refit.viewport.height).toBeCloseTo(fit.viewport.height, 0)
    expect(refit.zoomControls.bottom).toBeLessThanOrEqual(
      refit.viewport.bottom + 1,
    )
    await browser.setWindowSize(1600, 1000)
  })

  it('uses the persisted document session for base lifecycle and undo', async () => {
    await openM05()
    const initial = await snapshot()
    const base = initial.layers.find((layer) => layer.id === baseId)
    expect(base?.locked).toBe(true)

    await $('button[aria-label="Show layers"]').click()
    const baseRow = $(`[data-layer-id="${baseId}"]`)
    await baseRow.$('button[aria-label="Unlock layer"]').click()
    await baseRow.$('.cs-layer-select').click()
    await browser.keys('Delete')
    await browser.waitUntil(async () =>
      (await snapshot()).layers.every((layer) => layer.id !== baseId),
    )

    await clickEnabledHistoryAction('Undo')
    await browser.waitUntil(async () =>
      (await snapshot()).layers.some((layer) => layer.id === baseId),
    )
    const restored = await snapshot()
    const restoredBase = restored.layers.find((layer) => layer.id === baseId)
    expect(restoredBase?.payload.blobHash).toBe('f'.repeat(64))
  })

  it('flips canvas layers and crop as one document command', async () => {
    await openM05()
    await $('button=Flip horizontally').click()
    await browser.waitUntil(async () => (await snapshot()).crop?.x === 40)
    const flipped = await snapshot()
    expect(
      flipped.layers.find((layer) => layer.id === frontId)?.transform
        .translateX,
    ).toBe(120)

    await clickEnabledHistoryAction('Undo')
    await browser.waitUntil(async () => (await snapshot()).crop?.x === 20)
    expect(
      (await snapshot()).layers.find((layer) => layer.id === frontId)?.transform
        .translateX,
    ).toBe(40)
  })

  it('cycles overlapping layers through real canvas pointer clicks', async () => {
    await openM05()
    await $('button[aria-label="Show layers"]').click()
    const canvas = $('.cs-canvas[aria-label="Scene canvas"]')
    await canvas.click()
    await expect(
      $('[data-layer-id="019c1f62-058e-7000-8000-000000000104"]'),
    ).toHaveAttribute('aria-selected', 'true')
    await canvas.doubleClick()
    await expect(
      $('[data-layer-id="019c1f62-058e-7000-8000-000000000103"]'),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('commits one pointer move and restores it through undo and redo', async () => {
    await openM05()
    const canvas = $('.cs-canvas[aria-label="Scene canvas"]')
    const before = (await snapshot()).layers.find(
      (layer) => layer.id === frontId,
    )
    expect(before).toBeDefined()

    await browser
      .action('pointer', { id: 'm05-move-pointer' })
      .move({ origin: canvas, x: 0, y: 0, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 24, y: 12, duration: 100 })
      .perform(true)

    const transientPreview = await browser.execute(() => {
      const overlay = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas-overlay[aria-label="Interaction overlay"]',
      )
      if (!overlay) throw new Error('Interaction overlay is missing')
      const context = overlay.getContext('2d')
      if (!context) throw new Error('Interaction overlay context is missing')
      const pixels = context.getImageData(
        0,
        0,
        overlay.width,
        overlay.height,
      ).data
      let warmOpaque = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (
          pixels[index]! > 200 &&
          pixels[index + 1]! < 100 &&
          pixels[index + 2]! < 110 &&
          pixels[index + 3]! > 200
        ) {
          warmOpaque += 1
        }
      }
      return warmOpaque
    })
    expect(transientPreview).toBeGreaterThan(50)
    expect(
      (await snapshot()).layers.find((layer) => layer.id === frontId)
        ?.transform,
    ).toEqual(before?.transform)

    await browser
      .action('pointer', { id: 'm05-move-pointer' })
      .up({ button: 'left' })
      .perform()

    await browser.waitUntil(async () => {
      const layer = (await snapshot()).layers.find(
        (item) => item.id === frontId,
      )
      return layer?.transform.translateX !== before?.transform.translateX
    })
    const moved = (await snapshot()).layers.find(
      (layer) => layer.id === frontId,
    )
    expect(moved?.transform.translateY).not.toBe(before?.transform.translateY)

    await clickEnabledHistoryAction('Undo')
    await browser.waitUntil(async () => {
      const layer = (await snapshot()).layers.find(
        (item) => item.id === frontId,
      )
      return layer?.transform.translateX === before?.transform.translateX
    })
    await clickEnabledHistoryAction('Redo')
    await browser.waitUntil(async () => {
      const layer = (await snapshot()).layers.find(
        (item) => item.id === frontId,
      )
      return layer?.transform.translateX === moved?.transform.translateX
    })
  })

  it('draws snap guides only while Alt is held during a pointer gesture', async () => {
    await openM05()
    await $('button[aria-label="Show layers"]').click()
    await $(`[data-layer-id="${frontId}"] .cs-layer-select`).click()
    const start = await canvasPoint(68, 48)
    const next = await canvasPoint(70, 50)
    await browser
      .action('pointer', { id: 'm05-guide-pointer' })
      .move({ origin: 'viewport', x: start.x, y: start.y, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'viewport', x: next.x, y: next.y, duration: 40 })
      .perform(true)
    const withoutGuides = await browser.execute(() => {
      const overlay = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas-overlay[aria-label="Interaction overlay"]',
      )
      if (!overlay) throw new Error('Interaction overlay is missing')
      return overlay.toDataURL()
    })
    await browser
      .action('key', { id: 'm05-guide-key' })
      .down(Key.Alt)
      .perform(true)
    const readOverlay = () =>
      browser.execute(() => {
        const overlay = document.querySelector<HTMLCanvasElement>(
          '.cs-canvas-overlay[aria-label="Interaction overlay"]',
        )
        if (!overlay) throw new Error('Interaction overlay is missing')
        return overlay.toDataURL()
      })
    await browser.waitUntil(async () => (await readOverlay()) !== withoutGuides)
    const heldGuides = await readOverlay()
    expect(heldGuides).not.toBe(withoutGuides)

    await browser
      .action('key', { id: 'm05-guide-key' })
      .up(Key.Alt)
      .perform(true)
    await browser.waitUntil(async () => (await readOverlay()) === withoutGuides)
    const releasedGuides = await readOverlay()
    expect(releasedGuides).toBe(withoutGuides)
    await browser
      .action('pointer', { id: 'm05-guide-pointer' })
      .up({ button: 'left' })
      .perform()
  })

  it('recovers from pointer cancellation without leaving a transient gesture', async () => {
    await openM05()
    const canvas = $('.cs-canvas[aria-label="Scene canvas"]')
    const before = (await snapshot()).layers.find(
      (layer) => layer.id === frontId,
    )
    expect(before).toBeDefined()

    await browser
      .action('pointer', { id: 'm05-cancel-pointer' })
      .move({ origin: canvas, x: 0, y: 0, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 16, y: 8, duration: 50 })
      .cancel()
      .perform()
    const afterCancel = (await snapshot()).layers.find(
      (layer) => layer.id === frontId,
    )
    expect(afterCancel?.transform).toEqual(before?.transform)

    await browser
      .action('pointer', { id: 'm05-next-pointer' })
      .move({ origin: canvas, x: 0, y: 0, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: -12, y: 8, duration: 50 })
      .up({ button: 'left' })
      .perform()
    await browser.waitUntil(async () => {
      const layer = (await snapshot()).layers.find(
        (item) => item.id === frontId,
      )
      return layer?.transform.translateX !== afterCancel?.transform.translateX
    })
  })
})
