import fc from 'fast-check'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  createDocumentRenderScene,
  parseEditorDocument,
  serializeEditorDocument,
  type EditorDocumentV1,
  type LayerNode,
} from '../index'

const layer: LayerNode = {
  id: '019c1f62-058e-7000-8000-000000000001',
  kind: 'shape',
  transform: {
    translateX: 0,
    translateY: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  },
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
    nested: { value: 'immutable' },
  },
}

const document: EditorDocumentV1 = {
  schemaVersion: 3,
  id: '019c1f62-058e-7000-8000-000000000000',
  source: {
    blobHash: 'a'.repeat(64),
    format: 'png',
    mimeType: 'image/png',
    width: 100,
    height: 100,
    orientationApplied: true,
    color: { colorSpace: 'srgb', hasIccProfile: false },
  },
  canvas: { width: 100, height: 100 },
  crop: null,
  layers: [layer],
  presentation: { beautify: { enabled: false }, watermark: { enabled: false } },
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
}

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(
      new URL(`../../../../tests/fixtures/documents/${name}`, import.meta.url),
    ),
    'utf8',
  )
}

describe('editor document codec', () => {
  it('migrates v3 source provenance and validates typed v4 rich text', () => {
    const raw = JSON.parse(serializeEditorDocument(document)) as Record<
      string,
      unknown
    >
    raw.schemaVersion = 3
    const migrated = parseEditorDocument(JSON.stringify(raw))
    if (migrated.kind !== 'editable') throw new Error('expected editable')

    expect(migrated.document.schemaVersion).toBe(6)
    expect(migrated.document.source.provenance).toBe('capture')

    const text = {
      ...raw,
      schemaVersion: 5,
      source: { ...(raw.source as object), provenance: 'fileOpen' },
      layers: [
        {
          ...layer,
          kind: 'text',
          localBounds: { x: 0, y: 0, width: 10, height: 10 },
          payload: {
            content: {
              text: 'A😀B',
              wrap: 'autoSize',
              spans: [{ start: 0, end: 4, fontSize: 16 }],
              paragraphs: [],
            },
            font: {
              source: 'bundled',
              family: 'Roboto',
              weight: 400,
              style: 'normal',
            },
            fill: {
              kind: 'solid',
              color: { red: 0, green: 0, blue: 0, alpha: 1 },
              opacity: 1,
            },
            outline: null,
            background: null,
          },
        },
      ],
    }
    expect(parseEditorDocument(JSON.stringify(text))).toMatchObject({
      kind: 'editable',
    })

    text.layers[0]!.payload.content.spans[0]!.end = 2
    expect(() => parseEditorDocument(JSON.stringify(text))).toThrow(/UTF-16/u)
  })

  it('migrates v4 rich text and canonicalizes portable span overrides', () => {
    const raw = JSON.parse(serializeEditorDocument(document)) as Record<
      string,
      unknown
    >
    raw.schemaVersion = 4
    raw.layers = [
      {
        ...layer,
        kind: 'text',
        localBounds: { x: 0, y: 0, width: 40, height: 20 },
        payload: {
          content: {
            text: 'AB',
            wrap: 'autoSize',
            spans: [
              {
                start: 0,
                end: 1,
                color: { red: 1, green: 0, blue: 0, alpha: 1 },
              },
              {
                start: 1,
                end: 2,
                color: { red: 1, green: 0, blue: 0, alpha: 1 },
              },
            ],
            paragraphs: [],
          },
          font: {
            source: 'bundled',
            family: 'Roboto',
            weight: 400,
            style: 'normal',
          },
          fill: {
            kind: 'solid',
            color: { red: 0, green: 0, blue: 0, alpha: 1 },
            opacity: 1,
          },
          outline: null,
          background: null,
        },
      },
    ]
    const parsed = parseEditorDocument(JSON.stringify(raw))
    if (parsed.kind !== 'editable') throw new Error('expected editable')
    expect(parsed.document.schemaVersion).toBe(6)
    const content = (
      parsed.document.layers[0] as Extract<LayerNode, { kind: 'text' }>
    ).payload.content
    expect(content.spans).toEqual([
      {
        start: 0,
        end: 2,
        color: { red: 1, green: 0, blue: 0, alpha: 1 },
      },
    ])
  })

  it('migrates v5 arrow caps without changing legacy visual fields', () => {
    const raw = JSON.parse(serializeEditorDocument(document)) as Record<
      string,
      unknown
    >
    raw.schemaVersion = 5
    raw.layers = [
      {
        ...layer,
        kind: 'arrow',
        localBounds: { x: 0, y: 0, width: 96, height: 48 },
        opacity: 0.42,
        blendMode: 'overlay',
        payload: {
          path: 'quadratic',
          start: { x: 8, y: 32 },
          end: { x: 88, y: 32 },
          bend: { x: 48, y: 8 },
          stroke: {
            color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 0.8 },
            width: 3,
            style: 'dotted',
            cap: 'round',
            join: 'round',
          },
          startCap: 'chevron',
          endCap: 'triangle',
        },
      },
    ]

    const migrated = parseEditorDocument(JSON.stringify(raw))
    if (migrated.kind !== 'editable') throw new Error('expected editable')
    expect(migrated.document.schemaVersion).toBe(6)
    expect(migrated.document.layers[0]).toMatchObject({
      kind: 'arrow',
      localBounds: { x: 0, y: 0, width: 96, height: 48 },
      opacity: 0.42,
      blendMode: 'overlay',
      payload: {
        path: 'quadratic',
        start: { x: 8, y: 32 },
        end: { x: 88, y: 32 },
        bend: { x: 48, y: 8 },
        stroke: { width: 3, style: 'dotted' },
        startCap: 'lineArrow',
        endCap: 'solidArrow',
      },
    })
    const scene = createDocumentRenderScene(migrated.document)
    expect(scene.nodes.map((node) => node.kind)).toEqual([
      'path',
      'path',
      'polygon',
    ])
    expect(scene.nodes[0]).toMatchObject({
      id: `${layer.id}:body`,
      strokeWidth: 3,
      dash: [3, 6],
      opacity: 0.42,
      blendMode: 'overlay',
    })
    expect(scene.nodes[1]).toMatchObject({
      id: `${layer.id}:start-cap`,
      kind: 'path',
    })
    expect(scene.nodes[2]).toMatchObject({
      id: `${layer.id}:end-cap`,
      kind: 'polygon',
    })
    expect(
      parseEditorDocument(serializeEditorDocument(migrated.document)),
    ).toEqual(migrated)
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
    const raw = JSON.parse(serializeEditorDocument(document)) as Record<
      string,
      unknown
    >
    raw.layers = caps.map((cap, index) => ({
      ...layer,
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

    const parsed = parseEditorDocument(JSON.stringify(raw))
    expect(parsed).toMatchObject({ kind: 'editable' })
    if (parsed.kind !== 'editable') throw new Error('expected editable')
    expect(
      parseEditorDocument(serializeEditorDocument(parsed.document)),
    ).toEqual(parsed)
  })

  it('rejects malformed path-specific arrow data', () => {
    const candidate = JSON.parse(serializeEditorDocument(document)) as {
      layers: Array<Record<string, unknown>>
    }
    const arrow = {
      ...layer,
      kind: 'arrow',
      localBounds: { x: 0, y: 0, width: 80, height: 40 },
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
    }
    candidate.layers = [arrow]
    expect(() => parseEditorDocument(JSON.stringify(candidate))).toThrow(
      /bend is required/u,
    )

    ;(arrow.payload as Record<string, unknown>).path = 'elbow'
    expect(() => parseEditorDocument(JSON.stringify(candidate))).toThrow(
      /elbow is required/u,
    )
    ;(arrow.payload as Record<string, unknown>).elbow = {
      axis: 'z',
      offset: Number.NaN,
    }
    expect(() => parseEditorDocument(JSON.stringify(candidate))).toThrow(
      /elbow/u,
    )
    ;(arrow.payload as Record<string, unknown>).path = 'straight'
    ;(arrow.payload as Record<string, unknown>).startCap = 'chevron'
    expect(() => parseEditorDocument(JSON.stringify(candidate))).toThrow(
      /startCap/u,
    )
  })

  it('deeply freezes nested payload values', () => {
    const parsed = parseEditorDocument(serializeEditorDocument(document))
    if (parsed.kind !== 'editable')
      throw new Error('expected editable document')

    const nested = parsed.document.layers[0]?.payload.nested
    expect(Object.isFrozen(nested)).toBe(true)
  })

  it('rejects invalid presentation values instead of silently replacing them', () => {
    const raw = JSON.parse(serializeEditorDocument(document)) as Record<
      string,
      unknown
    >
    raw.presentation = {
      beautify: { enabled: true },
      watermark: { enabled: false },
    }

    expect(() => parseEditorDocument(JSON.stringify(raw))).toThrow(
      /presentation/u,
    )
  })

  it('rejects non-stable IDs and non-SHA-256 blob hashes', () => {
    const invalidId = JSON.parse(serializeEditorDocument(document)) as Record<
      string,
      unknown
    >
    invalidId.id = 'array-index-0'
    expect(() => parseEditorDocument(JSON.stringify(invalidId))).toThrow(/id/u)

    const invalidHash = JSON.parse(serializeEditorDocument(document)) as Record<
      string,
      unknown
    >
    ;(invalidHash.source as Record<string, unknown>).blobHash = 'not-a-hash'
    expect(() => parseEditorDocument(JSON.stringify(invalidHash))).toThrow(
      /blobHash/u,
    )
  })

  it('requires an explicit image role in persisted v2 documents', () => {
    const migrated = parseEditorDocument(fixture('v0-minimal.json'))
    if (migrated.kind !== 'editable') throw new Error('expected migration')
    const raw = JSON.parse(serializeEditorDocument(migrated.document)) as {
      layers: Array<{ payload: Record<string, unknown> }>
    }
    delete raw.layers[0]!.payload.role

    expect(() => parseEditorDocument(JSON.stringify(raw))).toThrow(
      /layers\[0\]\.payload\.role/u,
    )
  })

  it('rejects malformed M06 paint payloads before persistence', () => {
    const raw = JSON.parse(serializeEditorDocument(document)) as {
      layers: Array<{ payload: Record<string, unknown> }>
    }
    raw.layers[0]!.payload.fill = {
      kind: 'linearGradient',
      stops: [{ position: 0, color: { red: 0, green: 0, blue: 0, alpha: 1 } }],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
      opacity: 1,
    }

    expect(() => parseEditorDocument(JSON.stringify(raw))).toThrow(/stops/u)
  })

  it('round-trips valid crop values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (width, height) => {
          const candidate = { ...document, crop: { x: 0, y: 0, width, height } }
          const parsed = parseEditorDocument(serializeEditorDocument(candidate))
          expect(parsed).toMatchObject({ kind: 'editable' })
        },
      ),
    )
  })

  it('migrates v0 idempotently for generated valid crops', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (width, height) => {
          const raw = JSON.parse(serializeEditorDocument(document)) as Record<
            string,
            unknown
          >
          raw.schemaVersion = 0
          raw.crop = { x: 0, y: 0, width, height }
          delete raw.presentation
          const migrated = parseEditorDocument(JSON.stringify(raw))
          if (migrated.kind !== 'editable')
            throw new Error('expected editable document')
          expect(
            parseEditorDocument(serializeEditorDocument(migrated.document)),
          ).toEqual(migrated)
        },
      ),
    )
  })

  it('matches committed golden fixtures for supported and newer schemas', () => {
    const migrated = parseEditorDocument(fixture('v0-minimal.json'))
    if (migrated.kind !== 'editable')
      throw new Error('expected migrated fixture')
    expect(
      JSON.parse(serializeEditorDocument(migrated.document)),
    ).toMatchObject({
      schemaVersion: 6,
      layers: [
        {
          kind: 'image',
          locked: true,
          localBounds: { x: 0, y: 0, width: 100, height: 100 },
          payload: { role: 'base', blobHash: 'a'.repeat(64) },
        },
      ],
    })

    const futureFields = parseEditorDocument(fixture('v1-future-fields.json'))
    if (futureFields.kind !== 'editable')
      throw new Error('expected editable current fixture')
    expect(
      JSON.parse(serializeEditorDocument(futureFields.document)),
    ).toMatchObject({
      schemaVersion: 6,
      futureDocumentField: { preserved: true },
    })

    expect(
      parseEditorDocument(JSON.stringify({ schemaVersion: 7 })),
    ).toMatchObject({
      kind: 'readOnly',
      schemaVersion: 7,
    })
  })
})
