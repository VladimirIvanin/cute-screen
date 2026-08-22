import { describe, expect, it } from 'vitest'

import {
  applyEditorCommand,
  CommandManager,
  createCensorLayer,
  createDrawingLayer,
  createEmojiLayer,
  createLoupeLayer,
  createFlipCanvasCommand,
  createRulerLayer,
  createTextLayer,
  layerResizeCapability,
  normalizeEditableDocumentScales,
  parseEditorDocument,
  resizeLayerGeometry,
  serializeEditorDocument,
  type EditorDocumentV1,
  type LayerNode,
} from './index'

const DOCUMENT_ID = '019c1f62-058e-7000-8000-000000000000'
const CANVAS = Object.freeze({ width: 400, height: 300 })

function document(layers: readonly LayerNode[]): EditorDocumentV1 {
  return {
    schemaVersion: 7,
    id: DOCUMENT_ID,
    source: {
      blobHash: 'a'.repeat(64),
      format: 'png',
      mimeType: 'image/png',
      width: CANVAS.width,
      height: CANVAS.height,
      orientationApplied: true,
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas: CANVAS,
    crop: null,
    layers,
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
  }
}

function shape(): LayerNode {
  const layer = createDrawingLayer({
    id: '019c1f62-058e-7000-8000-000000000001',
    tool: 'shape',
    start: { x: 20, y: 30 },
    end: { x: 120, y: 90 },
  })
  if (!layer) throw new Error('shape fixture was not created')
  return layer
}

describe('image-only transform scale policy', () => {
  it('normalizes legacy non-image magnitudes without touching images or unit reflections', () => {
    const resized = {
      ...shape(),
      transform: {
        ...shape().transform,
        translateX: 17,
        translateY: 19,
        scaleX: -2,
        scaleY: 0.5,
      },
    } satisfies LayerNode
    const reflected = {
      ...shape(),
      id: '019c1f62-058e-7000-8000-000000000002',
      transform: { ...shape().transform, scaleX: -1, scaleY: 1 },
    } satisfies LayerNode
    const image = {
      id: '019c1f62-058e-7000-8000-000000000003',
      kind: 'image',
      transform: {
        translateX: 5,
        translateY: 6,
        rotation: 0,
        scaleX: 2,
        scaleY: 0.5,
      },
      localBounds: { x: 0, y: 0, width: 80, height: 60 },
      opacity: 1,
      visible: true,
      locked: false,
      blendMode: 'normal',
      shadows: [],
      payload: {
        blobHash: 'b'.repeat(64),
        intrinsicWidth: 80,
        intrinsicHeight: 60,
        format: 'png',
        orientationApplied: true,
        color: { colorSpace: 'srgb', hasIccProfile: false },
        role: 'content',
      },
    } satisfies LayerNode

    const normalized = normalizeEditableDocumentScales(
      document([resized, reflected, image]),
    )

    expect(normalized.layers[0]!.transform).toEqual({
      ...resized.transform,
      scaleX: 1,
      scaleY: 1,
    })
    expect(normalized.layers[1]).toBe(reflected)
    expect(normalized.layers[2]).toBe(image)
    expect(normalizeEditableDocumentScales(normalized)).toBe(normalized)
  })

  it('rejects new non-image non-unit scale at the command boundary', () => {
    const before = shape()
    const after = {
      ...before,
      transform: { ...before.transform, scaleX: 1.25 },
    } satisfies LayerNode

    expect(() =>
      applyEditorCommand(document([before]), {
        type: 'updateLayer',
        before,
        after,
      }),
    ).toThrow(/non-image.*scale/u)
    expect(() =>
      applyEditorCommand(document([]), { type: 'addLayer', layer: after }),
    ).toThrow(/non-image.*scale/u)
    expect(() =>
      applyEditorCommand(document([before]), {
        type: 'duplicateLayer',
        sourceId: before.id,
        layer: { ...after, id: '019c1f62-058e-7000-8000-000000000099' },
      }),
    ).toThrow(/non-image.*scale/u)
  })

  it('preserves a pure canvas reflection through persistence and exact undo/redo', () => {
    const before = document([shape()])
    const manager = new CommandManager(before)
    const normalizedBefore = manager.snapshot.document
    const command = createFlipCanvasCommand(normalizedBefore, 'horizontal')
    const flipped = manager.execute(command).document

    expect(Math.abs(flipped.layers[0]!.transform.scaleX)).toBe(1)
    expect(Math.abs(flipped.layers[0]!.transform.scaleY)).toBe(1)
    expect(normalizeEditableDocumentScales(flipped)).toBe(flipped)
    const parsed = parseEditorDocument(serializeEditorDocument(flipped))
    expect(parsed.kind).toBe('editable')
    if (parsed.kind !== 'editable')
      throw new Error('expected editable document')
    expect(parsed.document.layers[0]!.transform).toEqual(
      flipped.layers[0]!.transform,
    )

    expect(manager.undo().document).toEqual(normalizedBefore)
    expect(manager.redo().document).toEqual(flipped)
  })
})

describe('intrinsic layer resize', () => {
  it('reports the resize contract for every layer family', () => {
    const text = createTextLayer({
      id: '019c1f62-058e-7000-8000-000000000004',
      text: 'Intrinsic text width',
      origin: { x: 10, y: 10 },
    })!
    const pencil = createDrawingLayer({
      id: '019c1f62-058e-7000-8000-000000000005',
      tool: 'pencil',
      start: { x: 10, y: 10 },
      end: { x: 50, y: 30 },
      points: [
        { x: 10, y: 10, pressure: 0.25 },
        { x: 50, y: 30, pressure: 0.75 },
      ],
    })!

    expect(layerResizeCapability(shape())).toBe('bounds')
    expect(layerResizeCapability(pencil)).toBe('points')
    expect(layerResizeCapability(text)).toBe('textWidth')
    expect(
      layerResizeCapability(
        createRulerLayer({
          id: '019c1f62-058e-7000-8000-000000000006',
          start: { x: 10, y: 20 },
          end: { x: 110, y: 20 },
          canvas: CANVAS,
        }),
      ),
    ).toBe('ruler')
  })

  it('resizes shape bounds without changing transform scale or paint style', () => {
    const before = shape()
    const after = resizeLayerGeometry(before, 'se', { x: 180, y: 130 })

    expect(after.localBounds.width).toBeGreaterThan(before.localBounds.width)
    expect(after.localBounds.height).toBeGreaterThan(before.localBounds.height)
    expect(after.transform.scaleX).toBe(1)
    expect(after.transform.scaleY).toBe(1)
    expect(after.payload).toBe(before.payload)
  })

  it('rebases freehand points while preserving pressure and brush width', () => {
    const before = createDrawingLayer({
      id: '019c1f62-058e-7000-8000-000000000007',
      tool: 'marker',
      start: { x: 10, y: 10 },
      end: { x: 70, y: 40 },
      points: [
        { x: 10, y: 10, pressure: 0.2 },
        { x: 70, y: 40, pressure: 0.8 },
      ],
    })!
    const after = resizeLayerGeometry(before, 'e', {
      x: before.transform.translateX + before.localBounds.width * 2,
      y: before.transform.translateY + before.localBounds.height / 2,
    })
    if (before.kind !== 'marker' || after.kind !== 'marker') {
      throw new Error('expected marker layers')
    }

    expect(after.payload.width).toBe(before.payload.width)
    expect(after.payload.points).not.toEqual(before.payload.points)
    expect(
      (after.payload.points as readonly { readonly pressure: number }[]).map(
        ({ pressure }) => pressure,
      ),
    ).toEqual([0.2, 0.8])
    expect(after.transform.scaleX).toBe(1)
  })

  it('changes text wrap width without scaling its font spans', () => {
    const before = createTextLayer({
      id: '019c1f62-058e-7000-8000-000000000008',
      text: 'one two three four',
      origin: { x: 20, y: 20 },
      fontSize: 24,
    })!
    const after = resizeLayerGeometry(before, 'e', {
      x: before.transform.translateX + 90,
      y: before.transform.translateY,
    })
    if (after.kind !== 'text') throw new Error('expected text layer')

    expect(after.payload.content.wrap).toBe('fixedWidth')
    expect(after.payload.content.fixedWidth).toBeCloseTo(90)
    expect(after.payload.content.spans).toEqual(before.payload.content.spans)
    expect(after.transform.scaleX).toBe(1)
    expect(after.localBounds.height).toBeGreaterThanOrEqual(
      before.localBounds.height,
    )
  })

  it('resizes loupe lens and source square at fixed zoom and source centre', () => {
    const before = createLoupeLayer({
      id: '019c1f62-058e-7000-8000-000000000009',
      sourceRegion: { x: 40, y: 50, width: 40, height: 40 },
      destination: { x: 120, y: 100 },
      zoom: 2,
      size: 80,
      canvas: CANVAS,
    })
    const after = resizeLayerGeometry(
      before,
      'se',
      { x: 240, y: 220 },
      { preserveAspect: true, canvas: CANVAS },
    )
    if (after.kind !== 'loupe') throw new Error('expected loupe layer')

    expect(after.payload.zoom).toBe(before.payload.zoom)
    expect(after.payload.lens.size).toBe(after.localBounds.width)
    expect(after.payload.sourceRegion.width).toBeCloseTo(
      after.payload.lens.size / after.payload.zoom,
    )
    expect(
      after.payload.sourceRegion.x + after.payload.sourceRegion.width / 2,
    ).toBeCloseTo(60)
    expect(
      after.payload.sourceRegion.y + after.payload.sourceRegion.height / 2,
    ).toBeCloseTo(70)
  })

  it('moves ruler endpoints without changing its factual style', () => {
    const before = createRulerLayer({
      id: '019c1f62-058e-7000-8000-000000000010',
      start: { x: 20, y: 30 },
      end: { x: 120, y: 30 },
      thickness: 4,
      fontSize: 18,
      canvas: CANVAS,
    })
    const after = resizeLayerGeometry(
      before,
      'end',
      { x: 180, y: 80 },
      { canvas: CANVAS },
    )
    if (after.kind !== 'ruler') throw new Error('expected ruler layer')

    expect(after.payload.end).not.toEqual(before.payload.end)
    expect(after.payload.thickness).toBe(4)
    expect(after.payload.fontSize).toBe(18)
    expect(after.transform.scaleX).toBe(1)
    expect(after.transform.scaleY).toBe(1)
  })

  it('keeps emoji intrinsic resize square and leaves censor effect unchanged', () => {
    const emoji = createEmojiLayer({
      id: '019c1f62-058e-7000-8000-000000000011',
      grapheme: '🙂',
      asset: { collection: 'notoEmoji', version: '1', assetId: 'smile' },
      origin: { x: 10, y: 10 },
      size: 32,
    })
    const resizedEmoji = resizeLayerGeometry(
      emoji,
      'se',
      { x: 90, y: 50 },
      { preserveAspect: true },
    )
    const censor = createCensorLayer({
      id: '019c1f62-058e-7000-8000-000000000012',
      region: {
        kind: 'rectangle',
        bounds: { x: 10, y: 20, width: 50, height: 40 },
      },
      effect: { mode: 'pixelate', blockSize: 9 },
    })
    const resizedCensor = resizeLayerGeometry(censor, 'se', { x: 100, y: 90 })
    if (resizedCensor.kind !== 'censor') {
      throw new Error('expected censor layer')
    }

    expect(resizedEmoji.localBounds.width).toBe(resizedEmoji.localBounds.height)
    expect(resizedCensor.payload.effect).toBe(censor.payload.effect)
  })
})
