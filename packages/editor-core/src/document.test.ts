import { describe, expect, it } from 'vitest'

import { CommandManager } from './commands'
import { applyEditorCommand } from './commands/operations'
import { parseEditorDocument, serializeEditorDocument } from './document/codec'
import type { EditorDocumentV1, LayerNode } from './document/types'
import { invertMatrix, transformPoint, transformToMatrix } from './geometry'

const layer: LayerNode = {
  id: '019c1f62-058e-7000-8000-000000000001',
  kind: 'shape',
  transform: {
    translateX: 10,
    translateY: 20,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  },
  localBounds: { x: 0, y: 0, width: 20, height: 20 },
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

const document: EditorDocumentV1 = {
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
  layers: [layer],
  presentation: { beautify: { enabled: false }, watermark: { enabled: false } },
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
}

describe('M03 document core', () => {
  it('round-trips future fields in a supported schema', () => {
    const raw = JSON.parse(serializeEditorDocument(document)) as Record<
      string,
      unknown
    >
    raw.futureDocumentField = { preserved: true }
    const layers = raw.layers as Array<Record<string, unknown>>
    const firstLayer = layers[0]
    if (!firstLayer) throw new Error('fixture layer is missing')
    firstLayer.futureLayerField = 'kept'

    const parsed = parseEditorDocument(JSON.stringify(raw))
    expect(parsed.kind).toBe('editable')
    if (parsed.kind !== 'editable') return
    const roundTrip = JSON.parse(
      serializeEditorDocument(parsed.document),
    ) as Record<string, unknown>
    expect(roundTrip.futureDocumentField).toEqual({ preserved: true })
    expect(
      (roundTrip.layers as Array<Record<string, unknown>>)[0]?.futureLayerField,
    ).toBe('kept')
  })

  it('types older documents as unsupported and newer documents read-only', () => {
    const v0 = JSON.parse(serializeEditorDocument(document)) as Record<
      string,
      unknown
    >
    v0.schemaVersion = 0
    delete v0.crop
    delete v0.presentation
    expect(parseEditorDocument(JSON.stringify(v0))).toMatchObject({
      kind: 'unsupported',
      reason: 'olderSchema',
    })

    const future = { ...v0, schemaVersion: 8 }
    expect(parseEditorDocument(JSON.stringify(future))).toMatchObject({
      kind: 'readOnly',
      reason: 'newerSchema',
    })
  })

  it('applies, undoes, redoes and checkpoints document commands', () => {
    const manager = new CommandManager(document)
    const added = { ...layer, id: '019c1f62-058e-7000-8000-000000000002' }
    expect(
      manager.execute({ type: 'addLayer', layer: added }).document.layers,
    ).toHaveLength(2)
    expect(manager.snapshot.dirty).toBe(true)
    expect(manager.undo().document.layers).toHaveLength(1)
    expect(manager.redo().document.layers).toHaveLength(2)
    manager.markSaved()
    expect(manager.snapshot.dirty).toBe(false)
    manager.execute({
      type: 'setCrop',
      before: null,
      after: { x: 0, y: 0, width: 80, height: 80 },
    })
    expect(manager.snapshot.dirty).toBe(true)
  })

  it('does not mutate locked layers and validates crop bounds', () => {
    const locked = { ...layer, locked: true }
    const lockedDocument = { ...document, layers: [locked] }
    expect(() =>
      applyEditorCommand(lockedDocument, {
        type: 'removeLayer',
        layer: locked,
        index: 0,
      }),
    ).toThrow(/locked/u)
    expect(() =>
      applyEditorCommand(document, {
        type: 'setCrop',
        before: null,
        after: { x: 0, y: 0, width: 120, height: 10 },
      }),
    ).toThrow(/crop/u)
  })

  it('round-trips image-to-screen geometry', () => {
    const matrix = transformToMatrix({
      translateX: 5,
      translateY: -7,
      rotation: 60,
      scaleX: 2,
      scaleY: 3,
    })
    const point = { x: 12, y: -4 }
    const screen = transformPoint(matrix, point)
    const restored = transformPoint(invertMatrix(matrix), screen)
    expect(restored.x).toBeCloseTo(point.x)
    expect(restored.y).toBeCloseTo(point.y)
  })
})
