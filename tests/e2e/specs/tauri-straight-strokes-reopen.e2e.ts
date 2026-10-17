import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { shapeDocument } from '../shape-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

describe('constrained ink after restart', () => {
  it('restores ranges and all brushes from the saved native document', async () => {
    await $('.cs-toolrail button[aria-label="Pencil"]').waitForEnabled()
    await waitForStableCanvas()
    const layers = (await shapeDocument()).layers
    const pencils = layers.filter((layer) => layer.kind === 'pencil')
    expect(pencils).toHaveLength(6)
    expect(layers.filter((layer) => layer.kind === 'marker')).toHaveLength(2)
    expect(pencils.map((layer) => layer.payload.brush)).toEqual(['pen', 'stabilized', 'brush', 'pen', 'stabilized', 'brush'])
    for (const layer of pencils) {
      expect(layer.payload.strokeVersion).toBe(3)
      expect(layer.payload.straightSegments).toHaveLength(1)
      const range = (layer.payload.straightSegments as { start: number; end: number }[])[0]!
      const points = layer.payload.points as { x: number; y: number }[]
      expect(points.slice(range.start, range.end + 1)
        .every((p) => Math.abs(p.y - points[range.start]!.y) < 1e-8)).toBe(true)
    }
    await browser.saveScreenshot('artifacts/tauri-e2e/straight-strokes-reopened.png')
  })
})
