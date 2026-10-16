import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { shapeDocument } from '../shape-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

describe('brush document after native relaunch', () => {
  it('restores all strokes and the chosen brush without changing their algorithm', async () => {
    await $('.cs-toolrail button[aria-label="Pencil"]').waitForEnabled()
    await waitForStableCanvas()
    const document = await shapeDocument()
    const strokes = document.layers.filter((layer) => layer.kind === 'pencil')
    expect(strokes).toHaveLength(6)
    expect(strokes.map((stroke) => stroke.payload.brush)).toEqual([
      'pen', 'stabilized', 'brush', 'pen', 'stabilized', 'brush',
    ])
    for (const stroke of strokes) expect(stroke.payload).toMatchObject({ strokeVersion: 2, pressureMode: 'simulated' })
    await $('button[aria-label="Pencil"]').click()
    await $('button[aria-label="Brush and width"]').click()
    await expect($('.cs-brush-choices button[aria-label="Expressive brush"]')).toHaveAttribute('aria-pressed', 'true')
    await browser.saveScreenshot('artifacts/tauri-e2e/brushes-reopened.png')
  })
})
