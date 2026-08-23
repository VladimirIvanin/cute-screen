import { describe, expect, it } from 'vitest'

import { createEditorDocumentFromImage } from './document'
import type { LoupeLayer, ShapeLayer, SourceImageRef } from './document/types'
import { materializeQuickCaptureDocument } from './quick-capture'

const FULL_HASH = 'a'.repeat(64)
const CROP_HASH = 'b'.repeat(64)

function source(
  blobHash: string,
  width: number,
  height: number,
): SourceImageRef {
  return {
    blobHash,
    format: 'png',
    mimeType: 'image/png',
    width,
    height,
    orientationApplied: true,
    provenance: 'capture',
    color: { colorSpace: 'srgb', hasIccProfile: false },
  }
}

function draftDocument() {
  const document = createEditorDocumentFromImage({
    id: '019d0000-0000-7000-8000-000000000001',
    baseLayerId: '019d0000-0000-7000-8000-000000000002',
    source: source(FULL_HASH, 800, 600),
    timestamp: '2026-08-22T00:00:00.000Z',
  })
  const shape: ShapeLayer = {
    id: '019d0000-0000-7000-8000-000000000003',
    kind: 'shape',
    localBounds: { x: 0, y: 0, width: 80, height: 40 },
    transform: {
      translateX: 260,
      translateY: 180,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    shadows: [],
    payload: {},
  }
  const loupe: LoupeLayer = {
    id: '019d0000-0000-7000-8000-000000000004',
    kind: 'loupe',
    localBounds: { x: 0, y: 0, width: 120, height: 120 },
    transform: {
      translateX: 400,
      translateY: 260,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    shadows: [],
    payload: {
      sourceRegion: { x: 220, y: 140, width: 60, height: 60 },
      lens: { shape: 'circle', size: 120 },
      zoom: 2,
      border: {
        color: { red: 1, green: 0, blue: 0, alpha: 1 },
        width: 3,
      },
      shadow: null,
      sampleSource: 'compositeBelow',
    },
  }
  return {
    ...document,
    crop: { x: 200, y: 100, width: 360, height: 240 },
    layers: [document.layers[0]!, shape, loupe],
  }
}

describe('quick capture materialization', () => {
  it('rebases the selected crop without moving annotations relative to frozen pixels', () => {
    const draft = draftDocument()
    const beforeShape = draft.layers[1]
    const materialized = materializeQuickCaptureDocument(draft, {
      source: source(CROP_HASH, 360, 240),
      updatedAt: '2026-08-22T00:00:01.000Z',
    })

    expect(draft.layers[1]).toBe(beforeShape)
    expect(materialized.canvas).toEqual({ width: 360, height: 240 })
    expect(materialized.crop).toBeNull()
    expect(materialized.source.blobHash).toBe(CROP_HASH)

    const base = materialized.layers[0]!
    expect(base.kind).toBe('image')
    if (base.kind !== 'image') throw new Error('expected base')
    expect(base.localBounds).toEqual({ x: 0, y: 0, width: 360, height: 240 })
    expect(base.transform.translateX).toBe(0)
    expect(base.payload).toMatchObject({
      blobHash: CROP_HASH,
      intrinsicWidth: 360,
      intrinsicHeight: 240,
      role: 'base',
    })

    const shape = materialized.layers[1]!
    expect(shape.transform.translateX).toBe(60)
    expect(shape.transform.translateY).toBe(80)

    const loupe = materialized.layers[2]!
    expect(loupe.kind).toBe('loupe')
    if (loupe.kind !== 'loupe') throw new Error('expected loupe')
    expect(loupe.transform.translateX).toBe(200)
    expect(loupe.transform.translateY).toBe(160)
    expect(loupe.payload.sourceRegion).toEqual({
      x: 20,
      y: 40,
      width: 60,
      height: 60,
    })
  })

  it('rejects missing, invalid or mismatched crop metadata', () => {
    const draft = draftDocument()
    expect(() =>
      materializeQuickCaptureDocument(
        { ...draft, crop: null },
        {
          source: source(CROP_HASH, 360, 240),
        },
      ),
    ).toThrow(/crop/u)
    expect(() =>
      materializeQuickCaptureDocument(draft, {
        source: source(CROP_HASH, 359, 240),
      }),
    ).toThrow(/dimensions/u)
    expect(() =>
      materializeQuickCaptureDocument(
        { ...draft, crop: { x: 700, y: 500, width: 200, height: 200 } },
        { source: source(CROP_HASH, 200, 200) },
      ),
    ).toThrow(/bounds/u)
  })
})
