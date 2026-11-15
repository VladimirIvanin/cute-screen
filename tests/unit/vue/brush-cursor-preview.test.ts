import { createCanvas } from '@napi-rs/canvas'
import {
  describe,
  expect,
  it,
} from 'vitest'
import { DEFAULT_DRAWING_DEFAULTS } from '@cute-screen/editor-renderer'
import { BrushCursorPreview } from '../../../packages/editor-vue/src/shell/canvas/brush-cursor-preview'
import type { CanvasViewportProps } from '../../../packages/editor-vue/src/shell/canvas/contracts'
import { arrowDocument } from './app-test-kit'

function pencilWidth(width: number) {
  return {
    ...DEFAULT_DRAWING_DEFAULTS,
    pencil: { ...DEFAULT_DRAWING_DEFAULTS.pencil, width },
  }
}

function preview(
  props: Partial<CanvasViewportProps>,
  suspended: () => boolean = () => false,
) {
  const value = {
    activeTool: 'pencil',
    document: arrowDocument(),
    drawingDefaults: pencilWidth(16),
    zoom: 100,
    t: (key: string) => key,
    ...props,
  } as CanvasViewportProps
  return {
    props: value,
    cursor: new BrushCursorPreview(value, () => undefined, suspended),
  }
}

describe('brush cursor preview', () => {
  it('does not draw while selecting or panning', () => {
    const canvas = createCanvas(80, 80)
    const context = canvas.getContext('2d')
    const selecting = preview({ quickSelectionMode: true }).cursor
    selecting.move({ x: 40, y: 40 })
    selecting.draw(context as unknown as CanvasRenderingContext2D)
    const panning = preview({}, () => true).cursor
    panning.move({ x: 40, y: 40 })
    panning.draw(context as unknown as CanvasRenderingContext2D)
    expect(context.getImageData(46, 42, 1, 1).data[3]).toBe(0)
    selecting.dispose()
    panning.dispose()
  })

  it('follows the pencil width and stays off the cross', () => {
    const canvas = createCanvas(80, 80)
    const context = canvas.getContext('2d')
    const { props, cursor } = preview({})
    cursor.move({ x: 40, y: 40 })
    cursor.draw(context as unknown as CanvasRenderingContext2D)
    const inside = context.getImageData(46, 42, 1, 1).data
    expect(inside[3]).toBeGreaterThan(40)
    expect(inside[0]).toBeGreaterThan(inside[2]!)
    expect(context.getImageData(54, 40, 1, 1).data[3]).toBe(0)
    props.drawingDefaults = pencilWidth(8)
    cursor.refresh()
    context.clearRect(0, 0, 80, 80)
    cursor.draw(context as unknown as CanvasRenderingContext2D)
    expect(context.getImageData(46, 42, 1, 1).data[3]).toBe(0)
    expect(context.getImageData(42, 42, 1, 1).data[3]).toBeGreaterThan(40)
    cursor.dispose()
  })

  it('shows the highlighter disc with source-over colour', () => {
    const canvas = createCanvas(80, 80)
    const context = canvas.getContext('2d')
    const { cursor } = preview({ activeTool: 'marker' })
    cursor.move({ x: 40, y: 40 })
    cursor.draw(context as unknown as CanvasRenderingContext2D)
    const pixel = context.getImageData(46, 42, 1, 1).data
    expect(pixel[3]).toBeGreaterThan(20)
    expect(pixel[0]).toBeGreaterThan(pixel[2]!)
    expect(pixel[1]).toBeGreaterThan(pixel[2]!)
    cursor.dispose()
  })
})
