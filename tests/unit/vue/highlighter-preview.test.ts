import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
  createDocumentRenderScene,
  drawNodes2D,
  type HighlighterMode,
} from '@cute-screen/editor-renderer'
import { HighlighterPreview } from '../../../packages/editor-vue/src/shell/canvas/highlighter-preview'
import { arrowDocument } from './app-test-kit'

describe('highlighter preview compositing', () => {
  it.each((['highlight', 'illuminate', 'veil'] as HighlighterMode[]).flatMap((mode) => [1, 2].map((scale) => ({ mode, scale }))))('matches committed pixels and decoded PNG for $mode at density $scale', async ({ mode, scale }) => {
    const canvas = createCanvas(160 * scale, 90 * scale)
    const context = canvas.getContext('2d')
    context.fillStyle = mode === 'illuminate' ? '#17191c' : '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = mode === 'illuminate' ? '#ffffff' : '#000000'
    context.fillRect(30 * scale, 25 * scale, 10 * scale, 10 * scale)
    const committed = createCanvas(canvas.width, canvas.height)
    committed.getContext('2d').drawImage(canvas, 0, 0)
    const backdrop = canvas.toBuffer('image/png')
    const document = { ...arrowDocument(), canvas: { width: 160, height: 90 }, layers: [] }
    const marker = createDrawingLayer({ id: 'marker', tool: 'marker', start: { x: 10, y: 30 }, end: { x: 100, y: 30 }, points: [{ x: 10, y: 30 }, { x: 100, y: 30 }], defaults: { ...DEFAULT_DRAWING_DEFAULTS, marker: { ...DEFAULT_DRAWING_DEFAULTS.marker, highlighterMode: mode } } })!
    const preview = new HighlighterPreview(() => createCanvas(1, 1) as unknown as HTMLCanvasElement)
    const bounds = { x: 0, y: 0, width: 160, height: 90 }
    preview.draw(canvas as unknown as HTMLCanvasElement, marker, bounds, document, scale)
    const committedContext = committed.getContext('2d') as unknown as Parameters<typeof drawNodes2D>[0]
    committedContext.scale(scale, scale)
    drawNodes2D(committedContext, createDocumentRenderScene({ ...document, layers: [marker] }).nodes)
    const rgba = () => context.getImageData(0, 0, canvas.width, canvas.height).data
    expect(rgba()).toEqual(committed.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data)
    const decoded = await loadImage(committed.toBuffer('image/png'))
    const exportCanvas = createCanvas(canvas.width, canvas.height)
    exportCanvas.getContext('2d').drawImage(decoded, 0, 0)
    expect(rgba()).toEqual(exportCanvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data)
    expect([...context.getImageData(35 * scale, 30 * scale, 1, 1).data]).toEqual(mode === 'illuminate' ? [255, 255, 255, 255] : mode === 'highlight' ? [0, 0, 0, 255] : [89, 74, 26, 255])
    // Repeated preview frames must not accumulate alpha, and Escape restores the backdrop.
    preview.draw(canvas as unknown as HTMLCanvasElement, marker, bounds, document, scale)
    expect(rgba()).toEqual(exportCanvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data)
    preview.draw(canvas as unknown as HTMLCanvasElement, undefined, bounds, document, scale)
    expect(canvas.toBuffer('image/png')).toEqual(backdrop)
  })
})
