import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { exerciseCalloutEditing } from '../callout-editing'
import { selectionDocument } from '../selection-interactions'

describe('callout through production capture and native persistence', () => {
  it('edits a callout in Quick and keeps it after the Editor handoff', async () => {
    await browser.setWindowSize(1440, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('button[aria-label="Select"]').click()
    const canvas = $('.cs-canvas:not(.cs-canvas-overlay)')
    const size = await canvas.getSize()
    const origin = await canvas.getLocation()
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(origin.x + 5), y: Math.round(origin.y + 5) })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: Math.round(size.width * .12),
        y: Math.round(size.height * .12), duration: 200 })
      .up({ button: 'left' }).perform()
    await browser.waitUntil(async () => ((await selectionDocument()).crop?.x ?? 0) > 0)
    expect((await selectionDocument()).crop?.x).toBeGreaterThan(0)
    await exerciseCalloutEditing('artifacts/tauri-e2e', true)
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await browser.waitUntil(async () => (await selectionDocument()).layers.some((layer) => layer.kind === 'callout'))
    const callout = (await selectionDocument()).layers.find((layer) => layer.kind === 'callout')!
    expect(callout.payload).toMatchObject({ targetMarker: 'ring', labelMarker: 'none', frame: { kind: 'card' }, route: { path: 'orthogonal' } })
    await browser.saveScreenshot('artifacts/tauri-e2e/callout-editor-handoff.png')
  }).timeout(180_000)
})
