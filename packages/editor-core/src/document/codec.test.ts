import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  parseEditorDocument,
  serializeEditorDocument,
  type EditorDocumentV1,
  type LayerNode,
} from '../index'

const layer: LayerNode = {
  id: 'layer',
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
  id: 'document',
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
})
