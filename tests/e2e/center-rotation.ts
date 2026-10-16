import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'
import type {
  EditorDocumentV1,
  LayerNode,
} from '../../packages/editor-core/src'
import { waitForStableCanvas } from './canvas-ready'
import { setNumericInput } from './numeric-input'

async function rotationDocument(): Promise<EditorDocumentV1> {
  return browser.execute(() => {
    const state = window as typeof window & {
      __cuteScreenE2eM05?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eQuick?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eM08?: { snapshot(): { document: EditorDocumentV1 } }
    }
    const doc = state.__cuteScreenE2eQuick?.snapshot()
      ?? state.__cuteScreenE2eM05?.snapshot() ?? state.__cuteScreenE2eM08?.snapshot()?.document
    if (!doc) throw new Error('Rotation document was not mounted')
    return doc
  })
}

function center(layer: LayerNode) {
  const bounds = layer.localBounds!
  const t = layer.transform
  const radians = t.rotation * Math.PI / 180
  const x = (bounds.x + bounds.width / 2) * t.scaleX
  const y = (bounds.y + bounds.height / 2) * t.scaleY
  return {
    x: t.translateX + x * Math.cos(radians) - y * Math.sin(radians),
    y: t.translateY + x * Math.sin(radians) + y * Math.cos(radians),
  }
}

function expectFixedCenter(
  before: LayerNode,
  after: LayerNode,
): void {
  expect(center(after).x).toBeCloseTo(center(before).x, 7)
  expect(center(after).y).toBeCloseTo(center(before).y, 7)
  expect(after.localBounds).toEqual(before.localBounds)
  expect(after.payload).toEqual(before.payload)
  expect(after.transform.scaleX).toBe(before.transform.scaleX)
  expect(after.transform.scaleY).toBe(before.transform.scaleY)
}

export async function verifyCenterRotation(output: string): Promise<void> {
  await waitForStableCanvas()
  const quick = await $('.cs-quick-actions').isExisting()
  // Observe the actual fitted canvas and Quick's non-origin crop; create via UI.
  const document = await rotationDocument()
  const area = await browser.execute(({ doc, quickMode }) => {
    const rect = window.document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    const output = quickMode ? { x: 0, y: 0, ...doc.canvas } : doc.crop ?? { x: 0, y: 0, ...doc.canvas }
    const crop = doc.crop ?? output
    return {
      left: rect.left, top: rect.top,
      scaleX: rect.width / output.width, scaleY: rect.height / output.height,
      outputX: output.x, outputY: output.y,
      x: rect.left + (crop.x - output.x) * rect.width / output.width,
      y: rect.top + (crop.y - output.y) * rect.height / output.height,
      width: crop.width * rect.width / output.width,
      height: crop.height * rect.height / output.height,
    }
  }, { doc: document, quickMode: quick })
  await browser.execute(() => {
    window.document.addEventListener('pointerdown', (event) => {
      window.document.documentElement.dataset.rotationPointerTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
    window.document.addEventListener('keydown', (event) => {
      window.document.documentElement.dataset.rotationKeyTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
  })
  for (const tool of ['Shape', 'Arrow']) {
    await $(`.cs-toolrail button[aria-label="${tool}"]`).click()
    await waitForStableCanvas()
    const count = (await rotationDocument()).layers.length
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(area.x + area.width * .35), y: Math.round(area.y + area.height * .35) })
      .down({ button: 'left' })
      .move({ origin: 'viewport', x: Math.round(area.x + area.width * .57), y: Math.round(area.y + area.height * .48), duration: 180 })
      .up({ button: 'left' }).perform()
    await browser.waitUntil(async () => (await rotationDocument()).layers.length === count + 1)
    await waitForStableCanvas()
    const before = (await rotationDocument()).layers.at(-1)!
    const c = center(before)
    const b = before.localBounds!
    const dx = b.width / 2 * area.scaleX
    const dy = b.height / 2 * area.scaleY
    const length = Math.hypot(dx, dy)
    // Bounds-resize tools rotate 14 CSS px outside the corner; arrows use the corner.
    const offset = tool === 'Shape' ? 14 : 0
    const vector = { x: dx + dx / length * offset, y: dy + dy / length * offset }
    const pivot = {
      x: area.left + (c.x - area.outputX) * area.scaleX,
      y: area.top + (c.y - area.outputY) * area.scaleY,
    }
    const start = { x: Math.round(pivot.x + vector.x), y: Math.round(pivot.y + vector.y) }
    const end = { x: Math.round(pivot.x - vector.y), y: Math.round(pivot.y + vector.x) }
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    await browser.action('pointer').move({ origin: 'viewport', ...start }).perform()
    await expect(scene).toHaveElementClass('cs-canvas-rotate-cursor')
    await browser.action('key', { id: 'rotation-key' }).down(Key.Shift).perform(true)
    await browser.action('pointer').move({ origin: 'viewport', ...start }).down({ button: 'left' })
      .move({ origin: 'viewport', ...end, duration: 250 }).perform(true)
    expect((await rotationDocument()).layers.at(-1)).toEqual(before)
    await browser.saveScreenshot(`${output}-${tool.toLowerCase()}-preview.png`)
    await browser.action('pointer').up({ button: 'left' }).perform(true)
    await browser.action('key', { id: 'rotation-key' }).up(Key.Shift).perform()
    await browser.waitUntil(async () => (await rotationDocument()).layers.at(-1)!.transform.rotation === 90)
    const rotated = (await rotationDocument()).layers.at(-1)!
    expectFixedCenter(before, rotated)
    await $('button[aria-label="Undo"]').click()
    expect((await rotationDocument()).layers.at(-1)).toEqual(before)
    await $('button[aria-label="Redo"]').click()
    expect((await rotationDocument()).layers.at(-1)).toEqual(rotated)
    await browser.saveScreenshot(`${output}-${tool.toLowerCase()}-committed.png`)

    if (!quick) {
      if (!(await $('.cs-layers-panel').isDisplayed())) await $('button[aria-label="Show layers"]').click()
      const input = $('.cs-layers-control--rotation input')
      await setNumericInput(input, '180')
      // Numeric preview must stay transient and Escape restores the saved transform.
      expect((await rotationDocument()).layers.at(-1)).toEqual(rotated)
      await browser.saveScreenshot(`${output}-${tool.toLowerCase()}-numeric-preview.png`)
      await browser.keys('Escape')
      expect((await rotationDocument()).layers.at(-1)).toEqual(rotated)
      await setNumericInput(input, '180')
      await browser.keys('Enter')
      await browser.waitUntil(async () => (await rotationDocument()).layers.at(-1)!.transform.rotation === 180)
      expectFixedCenter(before, (await rotationDocument()).layers.at(-1)!)
      await $('button[aria-label="Undo"]').click()
      expect((await rotationDocument()).layers.at(-1)).toEqual(rotated)
      await $('button[aria-label="Redo"]').click()
      expectFixedCenter(before, (await rotationDocument()).layers.at(-1)!)
      await $('button[aria-label="Hide layers"]').click()
    }
  }
  expect(await $('html').getAttribute('data-rotation-pointer-trusted')).toBe('true')
  expect(await $('html').getAttribute('data-rotation-key-trusted')).toBe('true')
}
