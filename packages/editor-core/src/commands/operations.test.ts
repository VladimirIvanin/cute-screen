import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  applyEditorCommand,
  revertEditorCommand,
  type EditorDocumentV1,
  type LayerNode,
} from '../index'

const DOCUMENT_ID = '019c1f62-058e-7000-8000-000000000000'
const IDS = {
  first: '019c1f62-058e-7000-8000-000000000001',
  middle: '019c1f62-058e-7000-8000-000000000002',
  last: '019c1f62-058e-7000-8000-000000000003',
  locked: '019c1f62-058e-7000-8000-000000000004',
} as const

function layer(id: keyof typeof IDS, locked = false): LayerNode {
  return {
    id: IDS[id],
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
    locked,
    payload: { shape: 'rectangle' },
  }
}

function document(layers: readonly LayerNode[]): EditorDocumentV1 {
  return {
    schemaVersion: 1,
    id: DOCUMENT_ID,
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
    layers,
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
  }
}

describe('editor command operations', () => {
  it('restores a removed layer at its original z-order', () => {
    const first = layer('first')
    const middle = layer('middle')
    const last = layer('last')
    const before = document([first, middle, last])
    const command = { type: 'removeLayer' as const, layer: middle, index: 1 }

    const after = applyEditorCommand(before, command)
    expect(after.layers.map(({ id }) => id)).toEqual([IDS.first, IDS.last])
    expect(
      revertEditorCommand(after, command).layers.map(({ id }) => id),
    ).toEqual([IDS.first, IDS.middle, IDS.last])
  })

  it('allows an explicit unlock but blocks other locked-layer mutations', () => {
    const locked = layer('locked', true)
    const before = document([locked])
    const unlocked = { ...locked, locked: false }

    expect(
      applyEditorCommand(before, {
        type: 'updateLayer',
        before: locked,
        after: unlocked,
      }).layers[0]?.locked,
    ).toBe(false)

    expect(() =>
      applyEditorCommand(before, {
        type: 'updateLayer',
        before: locked,
        after: { ...locked, opacity: 0.5 },
      }),
    ).toThrow(/locked/u)
  })

  it('reverts a generated removal to the equivalent document', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 }), (index) => {
        const layers = [layer('first'), layer('middle'), layer('last')]
        const before = document(layers)
        const removed = layers[index]
        if (!removed) throw new Error('generated layer is missing')
        const command = { type: 'removeLayer' as const, layer: removed, index }
        const after = applyEditorCommand(before, command)
        expect(revertEditorCommand(after, command)).toEqual(before)
      }),
    )
  })
})
