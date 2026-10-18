import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { shapeDocument } from '../shape-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

describe('shape paint after native relaunch', () => {
  it('restores document gradients and remembered drawing defaults', async () => {
    await $('.cs-toolrail button[aria-label="Shape"]').waitForEnabled()
    await waitForStableCanvas()
    const shapes = (await shapeDocument()).layers.filter((layer) => layer.kind === 'shape')
    expect(shapes).toHaveLength(2)
    for (const shape of shapes) expect(shape.payload).toMatchObject({ fill: { kind: 'linearGradient' }, stroke: { style: 'dotted' } })
    await $('button[aria-label="Shape"]').click()
    const rect = await browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(rect.left + rect.width * 0.1), y: Math.round(rect.top + rect.height * 0.15) })
      .down({ button: 'left' })
      .move({ origin: 'viewport', x: Math.round(rect.left + rect.width * 0.3), y: Math.round(rect.top + rect.height * 0.3), duration: 160 })
      .up({ button: 'left' }).perform()
    await browser.waitUntil(async () => (await shapeDocument()).layers.filter((layer) => layer.kind === 'shape').length === 3)
    const created = (await shapeDocument()).layers.at(-1)!
    expect(created.payload.fill).toEqual(shapes[1]!.payload.fill)
    expect(created.payload.stroke).toEqual(shapes[1]!.payload.stroke)
    await browser.saveScreenshot('artifacts/tauri-e2e/shape-paint-reopened.png')
  })
})
