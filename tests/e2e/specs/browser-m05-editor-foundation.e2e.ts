import { $, browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'

type HarnessDocument = {
  readonly crop: { readonly x: number; readonly y: number } | null
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

async function openM05(): Promise<void> {
  await browser.url('/')
  await browser.execute(() => window.localStorage.clear())
  await browser.url('/?m05=1')
  await expect($('.cs-canvas-ready')).toExist()
  await browser.waitUntil(async () => (await snapshot()).layers.length === 4)
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
      .action('pointer')
      .move({ origin: canvas, x: 0, y: 0, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 24, y: 12, duration: 100 })
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
    const canvas = $('.cs-canvas[aria-label="Scene canvas"]')
    await browser
      .action('pointer', { id: 'm05-guide-pointer' })
      .move({ origin: canvas, x: 0, y: 0, duration: 0 })
      .down({ button: 'left' })
      .perform(true)
    await browser
      .action('key', { id: 'm05-guide-key' })
      .down(Key.Alt)
      .perform(true)
    await browser
      .action('pointer', { id: 'm05-guide-pointer' })
      .move({ origin: 'pointer', x: 1, y: 1, duration: 50 })
      .perform(true)

    const guidePixels = await browser.execute(() => {
      const overlay = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas-overlay[aria-label="Interaction overlay"]',
      )
      if (!overlay) throw new Error('Interaction overlay is missing')
      const context = overlay.getContext('2d')
      if (!context) throw new Error('Interaction overlay context is missing')
      const pixels = context.getImageData(78, 90, 5, 25).data
      let warm = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index]! > 150 && pixels[index + 1]! > 70) warm += 1
      }
      return warm
    })
    expect(guidePixels).toBeGreaterThan(0)

    await browser
      .action('key', { id: 'm05-guide-key' })
      .up(Key.Alt)
      .perform(true)
    const releasedPixels = await browser.execute(() => {
      const overlay = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas-overlay[aria-label="Interaction overlay"]',
      )
      if (!overlay) throw new Error('Interaction overlay is missing')
      const context = overlay.getContext('2d')
      if (!context) throw new Error('Interaction overlay context is missing')
      const pixels = context.getImageData(78, 90, 5, 25).data
      let warm = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index]! > 150 && pixels[index + 1]! > 70) warm += 1
      }
      return warm
    })
    expect(releasedPixels).toBe(0)
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
