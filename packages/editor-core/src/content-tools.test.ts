import { describe, expect, it } from 'vitest'

import {
  createCalloutLayer,
  createNumberedMarkerLayer,
  createContentImageLayer,
  createDuplicateLayerCommand,
  createEmojiLayer,
  createTextCommitCommand,
  createTextLayer,
  decodeClipboardLayersV1,
  encodeClipboardLayersV1,
  nextNumberedMarkerSequence,
  pasteClipboardLayers,
  routeClipboardSnapshot,
  type EditorDocumentV1,
  type EditorCommand,
  type LayerNode,
} from './index'

const document: EditorDocumentV1 = {
  schemaVersion: 5,
  id: '019c1f62-058e-7000-8000-000000000000',
  source: {
    blobHash: 'a'.repeat(64),
    format: 'png',
    mimeType: 'image/png',
    width: 100,
    height: 100,
    orientationApplied: true,
    provenance: 'capture',
    color: { colorSpace: 'srgb', hasIccProfile: false },
  },
  canvas: { width: 100, height: 100 },
  crop: null,
  layers: [],
  presentation: { beautify: { enabled: false }, watermark: { enabled: false } },
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
}

const ids = [
  '019c1f62-058e-7000-8000-000000000001',
  '019c1f62-058e-7000-8000-000000000002',
  '019c1f62-058e-7000-8000-000000000003',
] as const

describe('M07 content-layer core contracts', () => {
  it('creates portable text with one typed rich-text payload', () => {
    const layer = createTextLayer({
      id: ids[0],
      text: 'Привет\nworld',
      origin: { x: 8, y: 12 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
    })
    if (layer === null) throw new Error('expected non-empty text layer')

    expect(layer.payload.content.text).toBe('Привет\nworld')
    expect(layer.payload.content.wrap).toBe('autoSize')
    expect(layer.payload.fill).toMatchObject({ kind: 'solid' })
  })

  it('persists bounded underline and letter spacing in its single text span', () => {
    const layer = createTextLayer({
      id: ids[0],
      text: 'Spaced',
      origin: { x: 8, y: 12 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
      underline: true,
      letterSpacing: 3,
    })
    if (layer === null) throw new Error('expected non-empty text layer')

    expect(layer.payload.content.spans).toEqual([
      expect.objectContaining({
        start: 0,
        end: 6,
        underline: true,
        letterSpacing: 3,
      }),
    ])
    expect(() =>
      createTextLayer({
        id: ids[0],
        text: 'invalid',
        origin: { x: 8, y: 12 },
        font: {
          source: 'bundled',
          family: 'Roboto',
          weight: 400,
          style: 'normal',
        },
        letterSpacing: 257,
      }),
    ).toThrow('text letter spacing must be between -256 and 256')
  })

  it('persists an explicit solid text color instead of relying on a renderer default', () => {
    const layer = createTextLayer({
      id: ids[0],
      text: 'accent',
      origin: { x: 8, y: 12 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
      color: { red: 0.9, green: 0.28, blue: 0.3, alpha: 1 },
    })
    if (layer === null) throw new Error('expected non-empty text layer')

    expect(layer.payload.fill).toEqual({
      kind: 'solid',
      color: { red: 0.9, green: 0.28, blue: 0.3, alpha: 1 },
      opacity: 1,
    })
  })

  it('persists a shared gradient fill instead of collapsing it to a text color', () => {
    const fill = {
      kind: 'linearGradient' as const,
      stops: [
        { position: 0, color: { red: 1, green: 0, blue: 0, alpha: 1 } },
        { position: 1, color: { red: 0, green: 0, blue: 1, alpha: 1 } },
      ],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
      opacity: 1,
    }
    const layer = createTextLayer({
      id: ids[0],
      text: 'gradient',
      origin: { x: 8, y: 12 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
      fill,
    })
    if (layer === null) throw new Error('expected non-empty text layer')

    expect(layer.payload.fill).toEqual(fill)
  })

  it('persists text opacity and blend mode as common layer composition fields', () => {
    const layer = createTextLayer({
      id: ids[0],
      text: 'screen label',
      origin: { x: 8, y: 12 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
      opacity: 0.6,
      blendMode: 'screen',
    })
    if (layer === null) throw new Error('expected non-empty text layer')

    expect(layer).toMatchObject({ opacity: 0.6, blendMode: 'screen' })
  })

  it('keeps a portable text outline in the authored layer payload', () => {
    const outline = {
      stroke: {
        color: { red: 1, green: 1, blue: 1, alpha: 1 },
        width: 2,
        style: 'solid' as const,
        cap: 'round' as const,
        join: 'round' as const,
      },
      position: 'center' as const,
    }
    const layer = createTextLayer({
      id: ids[0],
      text: 'outlined',
      origin: { x: 8, y: 12 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
      outline,
    })
    if (layer === null) throw new Error('expected non-empty text layer')

    expect(layer.payload.outline).toEqual(outline)
  })

  it('keeps a bounded text background in the same portable layer payload', () => {
    const background = {
      fill: {
        kind: 'solid' as const,
        color: { red: 1, green: 0.8, blue: 0.2, alpha: 1 },
        opacity: 1,
      },
      padding: 6,
      radius: 4,
    }
    const layer = createTextLayer({
      id: ids[0],
      text: 'label',
      origin: { x: 8, y: 12 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
      background,
    })
    if (layer === null) throw new Error('expected non-empty text layer')

    expect(layer.payload.background).toEqual(background)
  })

  it('stores a bounded renderer-safe shadow stack directly on the text layer', () => {
    const shadows = [
      {
        color: { red: 0, green: 0, blue: 0, alpha: 0.35 },
        offsetX: 2,
        offsetY: 3,
        blur: 3,
      },
    ]
    const layer = createTextLayer({
      id: ids[0],
      text: 'shadowed',
      origin: { x: 8, y: 12 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
      shadows,
    })
    if (layer === null) throw new Error('expected non-empty text layer')

    expect(layer.shadows).toEqual(shadows)
    expect(() =>
      createTextLayer({
        id: ids[1],
        text: 'too blurry',
        origin: { x: 8, y: 12 },
        font: {
          source: 'bundled',
          family: 'Roboto',
          weight: 400,
          style: 'normal',
        },
        shadows: [{ ...shadows[0]!, blur: 129 }],
      }),
    ).toThrow('text shadows are invalid')
  })

  it('rejects an out-of-range text background before creating a command payload', () => {
    expect(() =>
      createTextLayer({
        id: ids[0],
        text: 'label',
        origin: { x: 8, y: 12 },
        font: {
          source: 'bundled',
          family: 'Roboto',
          weight: 400,
          style: 'normal',
        },
        background: {
          fill: {
            kind: 'solid',
            color: { red: 1, green: 1, blue: 1, alpha: 1 },
            opacity: 1,
          },
          padding: 257,
          radius: 4,
        },
      }),
    ).toThrow('text background padding must be between 0 and 256')
  })

  it('allocates the minimal free marker number and preserves duplicates', () => {
    const one = createNumberedMarkerLayer({
      id: ids[0],
      sequence: 1,
      origin: { x: 0, y: 0 },
    })
    const three = createNumberedMarkerLayer({
      id: ids[1],
      sequence: 3,
      origin: { x: 0, y: 0 },
    })

    expect(nextNumberedMarkerSequence([one, three])).toBe(2)
  })

  it('copies portable layers, remaps IDs and demotes a copied base image', () => {
    const textLayer = createTextLayer({
      id: ids[0],
      text: 'placeholder',
      origin: { x: 0, y: 0 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
    })
    if (textLayer === null) throw new Error('expected non-empty text layer')
    const base: LayerNode = {
      ...textLayer,
      kind: 'image',
      locked: true,
      payload: {
        blobHash: 'a'.repeat(64),
        intrinsicWidth: 100,
        intrinsicHeight: 100,
        format: 'png',
        orientationApplied: true,
        color: { colorSpace: 'srgb', hasIccProfile: false },
        role: 'base',
        border: null,
        radius: 0,
        crop: null,
        mask: null,
      },
    }
    const encoded = encodeClipboardLayersV1([base])
    const decoded = decodeClipboardLayersV1(encoded)
    const pasted = pasteClipboardLayers(decoded, {
      id: () => ids[2],
      zoom: 2,
      cascadeIndex: 1,
    })

    expect(pasted[0]).toMatchObject({
      id: ids[2],
      locked: false,
      payload: { role: 'content' },
      transform: { translateX: 8, translateY: 8 },
    })
  })

  it('does not allocate content commands for an empty new text layer', () => {
    expect(
      createTextLayer({
        id: ids[0],
        text: '',
        origin: { x: 0, y: 0 },
        font: {
          source: 'bundled',
          family: 'Roboto',
          weight: 400,
          style: 'normal',
        },
      }),
    ).toBeNull()
    expect(document.schemaVersion).toBe(5)
  })

  it('commits text as exactly one add, update or removal command', () => {
    const created = createTextLayer({
      id: ids[0],
      text: 'initial',
      origin: { x: 0, y: 0 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
    })
    if (created === null) throw new Error('expected text layer')
    const updated = createTextLayer({
      id: ids[0],
      text: 'changed',
      origin: { x: 0, y: 0 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
    })
    if (updated === null) throw new Error('expected updated text layer')

    expect(createTextCommitCommand({ next: created })).toMatchObject({
      type: 'addLayer',
    })
    expect(
      createTextCommitCommand({ existing: created, next: updated }),
    ).toMatchObject({ type: 'updateLayer' })
    expect(
      createTextCommitCommand({ existing: created, next: null, index: 0 }),
    ).toMatchObject({ type: 'removeLayer', index: 0 })
  })

  it('creates one duplicate command with the shared screen-space offset', () => {
    const source = createTextLayer({
      id: ids[0],
      text: 'duplicate me',
      origin: { x: 0, y: 0 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
    })
    if (source === null) throw new Error('expected text layer')
    const command: EditorCommand = createDuplicateLayerCommand(source, {
      id: ids[1],
      zoom: 2,
      cascadeIndex: 1,
    })
    expect(command).toMatchObject({
      type: 'duplicateLayer',
      sourceId: ids[0],
      layer: { id: ids[1], transform: { translateX: 8, translateY: 8 } },
    })
  })

  it('creates typed callout, emoji and immutable content-image layers', () => {
    const font = {
      source: 'bundled' as const,
      family: 'Roboto',
      weight: 400 as const,
      style: 'normal' as const,
    }
    expect(
      createCalloutLayer({
        id: ids[0],
        text: 'Read this',
        origin: { x: 10, y: 12 },
        tailAnchor: { x: 80, y: 90 },
        font,
      }),
    ).toMatchObject({
      kind: 'callout',
      payload: { content: { text: 'Read this' }, tailAnchor: { x: 80, y: 90 } },
    })
    expect(
      createEmojiLayer({
        id: ids[1],
        grapheme: '👩🏽‍💻',
        origin: { x: 4, y: 6 },
        asset: {
          collection: 'notoEmoji',
          version: '15.1',
          assetId: 'woman-technologist',
        },
      }),
    ).toMatchObject({ kind: 'emoji', payload: { grapheme: '👩🏽‍💻' } })
    expect(
      createContentImageLayer({
        id: ids[2],
        blobHash: 'b'.repeat(64),
        format: 'webp',
        intrinsicWidth: 80,
        intrinsicHeight: 60,
        origin: { x: 15, y: 20 },
      }),
    ).toMatchObject({
      kind: 'image',
      locked: false,
      localBounds: { width: 80, height: 60 },
      payload: { role: 'content', blobHash: 'b'.repeat(64) },
    })
  })

  it('sizes a multiline callout from its longest line and all line boxes', () => {
    const layer = createCalloutLayer({
      id: ids[0],
      text: 'wide line\nx',
      origin: { x: 10, y: 12 },
      tailAnchor: { x: 40, y: 80 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
    })
    if (layer === null) throw new Error('expected callout')

    expect(layer.localBounds).toMatchObject({
      width: 16 * 'wide line'.length * 0.6 + 16,
      height: 16 * 1.25 * 2 + 16,
    })
  })

  it('routes clipboard content by the documented active and empty-state precedence', () => {
    const internal = encodeClipboardLayersV1([
      createNumberedMarkerLayer({
        id: ids[0],
        sequence: 1,
        origin: { x: 0, y: 0 },
      }),
    ])
    expect(
      routeClipboardSnapshot({
        activeDocument: true,
        internal,
        bitmapAvailable: true,
        text: 'fallback',
      }),
    ).toMatchObject({ kind: 'internal' })
    expect(
      routeClipboardSnapshot({
        activeDocument: true,
        internal: '{bad json',
        bitmapAvailable: true,
        text: 'fallback',
      }),
    ).toMatchObject({ kind: 'bitmap', warning: 'internalPayloadInvalid' })
    expect(
      routeClipboardSnapshot({
        activeDocument: true,
        text: 'plain text',
      }),
    ).toEqual({ kind: 'text', text: 'plain text' })
    expect(
      routeClipboardSnapshot({
        activeDocument: false,
        internal,
        text: 'plain text',
      }),
    ).toEqual({ kind: 'emptyHint' })
    expect(
      routeClipboardSnapshot({
        activeDocument: false,
        bitmapAvailable: true,
      }),
    ).toEqual({ kind: 'bitmap' })
  })
})
