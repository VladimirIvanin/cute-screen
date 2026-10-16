import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { waitForStableCanvas } from '../canvas-ready'
import { shapeDocument } from '../shape-toolbar'

describe('tool settings after a separate native launch', () => {
  it('creates strokes and spotlights with remembered defaults and retains the angle step', async () => {
    await waitForStableCanvas()
    const restored = await shapeDocument()
    const spotlights = restored.layers.filter((layer) => layer.kind === 'spotlight')
    expect(spotlights).toHaveLength(2)
    for (const spotlight of spotlights) expect(spotlight.payload.apertures).toHaveLength(2)
    expect(restored.layers.some((layer) => layer.kind === 'pencil' && layer.payload.smoothing === .75)).toBe(true)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await $('.cs-toolrail button[aria-label="Pencil"]').click()
    const canvas = $('.cs-canvas:not(.cs-canvas-overlay)')
    await browser.action('pointer').move({ origin: canvas, x: -70, y: -40 })
      .down({ button: 'left' }).move({ origin: 'pointer', x: 100, y: 40, duration: 150 })
      .up({ button: 'left' }).perform()
    await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)?.kind === 'pencil')
    expect((await shapeDocument()).layers.at(-1)?.payload).toMatchObject({ brush: 'brush', width: 6, smoothing: .75 })
    await $('.cs-toolrail button[aria-label="Spotlight"]').click()
    await browser.action('pointer').move({ origin: canvas, x: -50, y: -30 })
      .down({ button: 'left' }).move({ origin: 'pointer', x: 100, y: 80, duration: 150 })
      .up({ button: 'left' }).perform()
    await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)?.kind === 'spotlight')
    expect((await shapeDocument()).layers.at(-1)?.payload.dimOpacity).toBe(.8)
    await $('.cs-toolrail button[aria-label="Ruler"]').click({ button: 'right' })
    await $('.cs-tool-configure-popover-host button[aria-label="Measurement and snapping"]').click()
    await expect($('[role="dialog"] input[aria-label="Angle step"]')).toHaveValue('30')
    await browser.saveScreenshot('artifacts/tauri-e2e/tool-settings-reopen.png')
    await browser.keys('Escape')
    await browser.keys('Escape')
  })
})
