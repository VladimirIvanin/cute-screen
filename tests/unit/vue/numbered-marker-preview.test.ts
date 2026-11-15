import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { NumberedMarkerPreview } from '../../../packages/editor-vue/src/shell/canvas/numbered-marker-preview'
import type { CanvasViewportProps } from '../../../packages/editor-vue/src/shell/canvas/contracts'

function preview(quickSelectionMode: boolean) {
  const props = {
    activeTool: 'numberedMarker',
    document: { id: 'doc' },
    quickSelectionMode,
    t: (key: string) => key,
  } as CanvasViewportProps
  return new NumberedMarkerPreview(props, () => undefined, () => false)
}

describe('numbered marker cursor preview', () => {
  it('does not draw while a new quick capture is still selecting', () => {
    const marker = preview(true)
    marker.move({ x: 12, y: 18 })
    const context = { save: vi.fn(), translate: vi.fn(), restore: vi.fn() }
    marker.draw(context as unknown as CanvasRenderingContext2D)
    expect(context.save).not.toHaveBeenCalled()
    marker.dispose()
  })
})
