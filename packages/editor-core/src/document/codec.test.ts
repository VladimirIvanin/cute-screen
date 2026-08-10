import fc from 'fast-check'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
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
  payload: { shape: 'rectangle', nested: { value: 'immutable' } },
}

const document: EditorDocumentV1 = {
  schemaVersion: 1,
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
      schemaVersion: 2,
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
      schemaVersion: 2,
      futureDocumentField: { preserved: true },
    })

    expect(
      parseEditorDocument(JSON.stringify({ schemaVersion: 3 })),
    ).toMatchObject({
      kind: 'readOnly',
      schemaVersion: 3,
    })
  })
})
