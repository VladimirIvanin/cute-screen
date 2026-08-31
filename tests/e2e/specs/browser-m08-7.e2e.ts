import { $, browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import {
  frontId,
  m08Snapshot,
  openM08,
  canvasPoint,
  overlayImage,
} from './browser-m08-test-kit'

describe('M08 crop and precision acceptance in browser mode', () => {
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
})
