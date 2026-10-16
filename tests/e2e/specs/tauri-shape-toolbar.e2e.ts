import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { waitForStableCanvas } from '../canvas-ready'
import { verifyNumericOpacity } from '../numeric-controls'
import {
  shapeDocument,
  verifyShapeToolbar,
  verifyShapeDefaults,
  verifyShapeCatalogue,
} from '../shape-toolbar'

describe('shape toolbar through production capture in WebView', () => {
  it('edits the same shape in Quick and the materialized editor', async () => {
    await browser.setWindowSize(1024, 700)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyShapeToolbar('artifacts/tauri-e2e', 'shape-quick')
    await verifyNumericOpacity('artifacts/tauri-e2e', 'numeric-quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    const quickShape = (await shapeDocument()).layers.at(-1)!
    expect(quickShape).toMatchObject({ kind: 'shape', opacity: 0.75, blendMode: 'multiply', payload: { cornerRadius: 12, fill: { kind: 'solid', color: { red: 0.2, green: 0.4, blue: 0.6 } }, stroke: { width: 8 } } })
    await verifyShapeToolbar('artifacts/tauri-e2e', 'shape-editor')
    await verifyNumericOpacity('artifacts/tauri-e2e', 'numeric-editor')
    expect((await shapeDocument()).layers.at(-1)!).toMatchObject({ kind: 'shape', opacity: 0.75, blendMode: 'multiply' })
    await verifyShapeDefaults()
    await verifyShapeCatalogue('artifacts/tauri-e2e', 'shape-expanded-native')
  })
})
