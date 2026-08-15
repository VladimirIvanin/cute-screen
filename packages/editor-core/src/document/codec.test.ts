import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  parseEditorDocument,
  serializeEditorDocument,
  type EditorDocument,
  type LayerNode,
} from '../index'

const shape: LayerNode = {
  id: '019c1f62-058e-7000-8000-000000000001',
  kind: 'shape',
  transform: {
    translateX: 0,
    translateY: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  },
  localBounds: { x: 0, y: 0, width: 40, height: 20 },
  opacity: 1,
  visible: true,
  locked: false,
  blendMode: 'normal',
  shadows: [],
  payload: {
    shape: 'rectangle',
    fill: { kind: 'none' },
    stroke: {
      color: { red: 0.898, green: 0.282, blue: 0.302, alpha: 1 },
      width: 3,
      style: 'solid',
      cap: 'round',
      join: 'round',
    },
    cornerRadius: 0,
    starPoints: 5,
    starInnerRatio: 0.45,
  },
}

const document: EditorDocument = {
  schemaVersion: 7,
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
  layers: [shape],
  presentation: { beautify: { enabled: false }, watermark: { enabled: false } },
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
}

function rawDocument(): Record<string, unknown> {
  return JSON.parse(serializeEditorDocument(document)) as Record<
    string,
    unknown
  >
}

describe('editor document v7 codec', () => {
  it('round-trips current non-text layers and preserves document/layer extras', () => {
    const raw = rawDocument()
    raw.futureDocumentField = { preserved: true }
    const layers = raw.layers as Array<Record<string, unknown>>
    layers[0]!.futureLayerField = 'kept'

    const parsed = parseEditorDocument(raw)
    if (parsed.kind !== 'editable') throw new Error('expected editable v7')
    const roundTrip = JSON.parse(serializeEditorDocument(parsed.document)) as {
      futureDocumentField?: unknown
      layers: Array<Record<string, unknown>>
    }
    expect(roundTrip.futureDocumentField).toEqual({ preserved: true })
    expect(roundTrip.layers[0]?.futureLayerField).toBe('kept')
  })

  it('round-trips every arrow path and endpoint type', () => {
    const caps = [
      'none',
      'lineArrow',
      'solidArrow',
      'triangle',
      'circle',
      'diamond',
    ] as const
    const raw = rawDocument()
    raw.layers = caps.map((cap, index) => ({
      ...shape,
      id: `019c1f62-058e-7000-8000-0000000001${String(index).padStart(2, '0')}`,
      kind: 'arrow',
      localBounds: { x: 0, y: 0, width: 80, height: 40 },
      payload: {
        path:
          index % 3 === 0
            ? 'straight'
            : index % 3 === 1
              ? 'quadratic'
              : 'elbow',
        start: { x: 4, y: 20 },
        end: { x: 76, y: 20 },
        ...(index % 3 === 1 ? { bend: { x: 40, y: 4 } } : {}),
        ...(index % 3 === 2
          ? { elbow: { axis: index % 2 === 0 ? 'x' : 'y', offset: 20 } }
          : {}),
        stroke: {
          color: { red: 1, green: 0, blue: 0, alpha: 1 },
          width: 3,
          style: index % 2 === 0 ? 'solid' : 'dashed',
          cap: 'round',
          join: 'round',
        },
        startCap: cap,
        endCap: caps.at(-(index + 1)),
      },
    }))

    const parsed = parseEditorDocument(raw)
    if (parsed.kind !== 'editable') throw new Error('expected editable v7')
    expect(
      parseEditorDocument(serializeEditorDocument(parsed.document)),
    ).toEqual(parsed)
  })

  it('rejects malformed path-specific arrow data', () => {
    const raw = rawDocument()
    raw.layers = [
      {
        ...shape,
        kind: 'arrow',
        payload: {
          path: 'quadratic',
          start: { x: 4, y: 20 },
          end: { x: 76, y: 20 },
          stroke: {
            color: { red: 1, green: 0, blue: 0, alpha: 1 },
            width: 3,
            style: 'solid',
            cap: 'round',
            join: 'round',
          },
          startCap: 'none',
          endCap: 'solidArrow',
        },
      },
    ]
    expect(() => parseEditorDocument(raw)).toThrow(/bend is required/u)
  })

  it('deeply freezes nested precision-tool payload values', () => {
    const raw = rawDocument()
    raw.layers = [
      {
        ...shape,
        kind: 'spotlight',
        payload: {
          shape: 'rectangle',
          dimColor: { red: 0, green: 0, blue: 0, alpha: 1 },
          dimOpacity: 0.65,
          feather: null,
        },
      },
    ]
    const parsed = parseEditorDocument(raw)
    if (parsed.kind !== 'editable') throw new Error('expected editable v7')
    const spotlight = parsed.document.layers[0]
    if (spotlight?.kind !== 'spotlight') throw new Error('expected spotlight')
    expect(Object.isFrozen(spotlight.payload.dimColor)).toBe(true)
  })

  it('rejects invalid presentation, IDs and source hashes', () => {
    const presentation = rawDocument()
    presentation.presentation = {
      beautify: { enabled: true },
      watermark: { enabled: false },
    }
    expect(() => parseEditorDocument(presentation)).toThrow(/presentation/u)

    const id = rawDocument()
    id.id = 'array-index-0'
    expect(() => parseEditorDocument(id)).toThrow(/id/u)

    const hash = rawDocument()
    ;(hash.source as Record<string, unknown>).blobHash = 'not-a-hash'
    expect(() => parseEditorDocument(hash)).toThrow(/blobHash/u)
  })

  it('requires an explicit image role and rejects inline image bytes', () => {
    const raw = rawDocument()
    raw.layers = [
      {
        ...shape,
        kind: 'image',
        payload: {
          blobHash: 'a'.repeat(64),
          intrinsicWidth: 100,
          intrinsicHeight: 100,
          format: 'png',
          orientationApplied: true,
          color: { colorSpace: 'srgb', hasIccProfile: false },
          border: null,
          radius: 0,
          crop: null,
          mask: null,
        },
      },
    ]
    expect(() => parseEditorDocument(raw)).toThrow(/role/u)
    ;(
      raw.layers as Array<{ payload: Record<string, unknown> }>
    )[0]!.payload.role = 'base'
    ;(
      raw.layers as Array<{ payload: Record<string, unknown> }>
    )[0]!.payload.base64 = 'AAAA'
    expect(() => parseEditorDocument(raw)).toThrow(/immutable image bytes/u)
  })

  it('rejects malformed non-text paint payloads', () => {
    const raw = rawDocument()
    ;(
      raw.layers as Array<{ payload: Record<string, unknown> }>
    )[0]!.payload.fill = {
      kind: 'linearGradient',
      stops: [{ position: 0, color: { red: 0, green: 0, blue: 0, alpha: 1 } }],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
      opacity: 1,
    }
    expect(() => parseEditorDocument(raw)).toThrow(/stops/u)
  })

  it('round-trips generated valid crop values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (width, height) => {
          const candidate: EditorDocument = {
            ...document,
            crop: { x: 0, y: 0, width, height },
          }
          expect(
            parseEditorDocument(serializeEditorDocument(candidate)),
          ).toMatchObject({ kind: 'editable' })
        },
      ),
    )
  })

  it('round-trips terminal empty paragraph metadata for a continued bullet', () => {
    const raw = rawDocument()
    raw.layers = [
      {
        id: '019c1f62-058e-7000-8000-000000000099',
        kind: 'text',
        transform: {
          translateX: 0,
          translateY: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        localBounds: { x: 0, y: 0, width: 120, height: 60 },
        visible: true,
        locked: false,
        payload: {
          content: {
            text: 'item\n',
            wrap: 'autoSize',
            spans: [
              {
                start: 0,
                end: 5,
                fontFamily: 'Roboto',
                fontSize: 24,
                color: { red: 0, green: 0, blue: 0, alpha: 1 },
                weight: 400,
                italic: false,
                strikethrough: false,
              },
            ],
            paragraphs: [
              {
                start: 0,
                end: 5,
                alignment: 'start',
                listKind: 'bullet',
              },
              {
                start: 5,
                end: 5,
                alignment: 'start',
                listKind: 'none',
              },
            ],
          },
          background: null,
        },
      },
    ]

    const parsed = parseEditorDocument(raw)
    if (parsed.kind !== 'editable') throw new Error('expected editable v7')
    expect(
      parsed.document.layers[0]?.kind === 'text'
        ? parsed.document.layers[0].payload.content.paragraphs
        : undefined,
    ).toEqual([
      { start: 0, end: 5, alignment: 'start', listKind: 'bullet' },
      { start: 5, end: 5, alignment: 'start', listKind: 'none' },
    ])
  })

  it('returns typed states for every unsupported older schema and v8+', () => {
    for (let schemaVersion = 0; schemaVersion <= 6; schemaVersion += 1) {
      expect(parseEditorDocument({ schemaVersion })).toMatchObject({
        kind: 'unsupported',
        schemaVersion,
        reason: 'olderSchema',
      })
    }
    expect(parseEditorDocument({ schemaVersion: 8 })).toMatchObject({
      kind: 'readOnly',
      schemaVersion: 8,
      reason: 'newerSchema',
    })
  })
})
