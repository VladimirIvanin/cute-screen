import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  createDrawingLayer,
  createDocumentRenderScene,
  DEFAULT_DRAWING_DEFAULTS,
  type LayerNode,
} from '@cute-screen/editor-core'
import { renderHeadlessCanvasKitPng } from '@cute-screen/editor-renderer'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import {
  canvasKit,
  canvas2dPngs,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import {
  assertGolden,
  rgba,
} from './golden-assertion-test-kit'
import { compareRgba } from './golden'

beforeAll(prepareGoldenRuntime)

function scene() {
  const layers: LayerNode[] = []
  for (const [row, style] of ['solid', 'dashed', 'dotted'].entries()) {
    for (const [index, appearance] of ['handDrawn', 'clean'].entries()) {
      layers.push(createDrawingLayer({
        id: `019c1f62-058e-7000-8000-0000000000${row}${index}`, tool: 'line',
        start: { x: 55, y: 60 + row * 210 + index * 75 },
        end: { x: 1200, y: 60 + row * 210 + index * 75 },
        defaults: { ...DEFAULT_DRAWING_DEFAULTS, line: { ...DEFAULT_DRAWING_DEFAULTS.line,
          appearance, stroke: { ...DEFAULT_DRAWING_DEFAULTS.line.stroke as object, width: [2, 5, 10][row]!, style },
        } },
      })!)
    }
  }
  return createDocumentRenderScene({ ...documentFixture, canvas: { width: 1280, height: 720 }, layers })
}

describe('hand-drawn line decoded exports', () => {
  it.each([1, 2])('retains preview and both backend goldens at scale %i', async (scale) => {
    const snapshot = scene()
    const fallback = await canvas2dPngs(snapshot, 1, scale)
    const kit = renderHeadlessCanvasKitPng(canvasKit, snapshot, [], { scale })
    const a = await rgba(fallback.exported), b = await rgba(kit)
    expect(a.length).toBe(1280 * 720 * scale * scale * 4)
    expect(compareRgba(a, b, 32).changedChannels / a.length).toBeLessThan(0.01)
    if (scale === 1)
      expect(compareRgba(a, await rgba(fallback.preview))).toEqual({ changedChannels: 0, maximumDelta: 0 })
    await assertGolden(`hand-drawn-line-${scale}-canvas2d`, fallback.exported)
    await assertGolden(`hand-drawn-line-${scale}-canvaskit`, kit)
  }, 30000)
})
