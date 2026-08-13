import { describe, expect, it } from 'vitest'

import {
  DocumentSpatialIndex,
  hitTestDocument,
  hitTestDocumentAll,
  rebaseArrowLayer,
  type EditorDocumentV1,
} from './index'

const source = {
  blobHash: 'a'.repeat(64),
  format: 'png' as const,
  mimeType: 'image/png',
  width: 100,
  height: 100,
  orientationApplied: true as const,
  color: { colorSpace: 'srgb' as const, hasIccProfile: false },
}
const transform = {
  translateX: 0,
  translateY: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
}
function layer(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'shape' as const,
    localBounds: { x: 0, y: 0, width: 20, height: 20 },
    transform,
    opacity: 1,
    visible: true,
    locked: false,
    payload: {},
    ...overrides,
  }
}
function document(layers: EditorDocumentV1['layers']): EditorDocumentV1 {
  return {
    schemaVersion: 2,
    id: '019c1f62-058e-7000-8000-000000000000',
    source,
    canvas: { width: 100, height: 100 },
    crop: null,
    layers,
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  }
}

describe('M05 hit testing', () => {
  it('returns the topmost unlocked visible layer', () => {
    expect(
      hitTestDocument(document([layer('bottom'), layer('top')]), {
        x: 10,
        y: 10,
      }),
    ).toMatchObject({
      nodeId: 'top',
      zOrder: 1,
    })
  })

  it('skips locked and hidden layers for canvas transforms', () => {
    expect(
      hitTestDocument(
        document([
          layer('bottom'),
          layer('locked', { locked: true }),
          layer('hidden', { visible: false }),
        ]),
        { x: 10, y: 10 },
      ),
    ).toMatchObject({ nodeId: 'bottom' })
  })

  it('returns overlap candidates from top to bottom for cycling', () => {
    expect(
      hitTestDocumentAll(
        document([layer('bottom'), layer('middle'), layer('top')]),
        {
          x: 10,
          y: 10,
        },
      ).map((hit) => hit.nodeId),
    ).toEqual(['top', 'middle', 'bottom'])
  })

  it('updates only affected bounds while preserving z-ordered point results', () => {
    const initial = document([layer('bottom'), layer('top')])
    const index = new DocumentSpatialIndex(initial)
    expect(index.hitAll({ x: 10, y: 10 }).map((hit) => hit.nodeId)).toEqual([
      'top',
      'bottom',
    ])
    const moved = document([
      layer('bottom'),
      layer('top', { transform: { ...transform, translateX: 40 } }),
    ])
    index.update(moved, ['top'])
    expect(index.hitAll({ x: 10, y: 10 }).map((hit) => hit.nodeId)).toEqual([
      'bottom',
    ])
    expect(index.hitAll({ x: 45, y: 10 }).map((hit) => hit.nodeId)).toEqual([
      'top',
    ])
  })

  it('does not return candidates outside the spatial query bounds', () => {
    const index = new DocumentSpatialIndex(
      document([
        layer('near'),
        layer('far', { transform: { ...transform, translateX: 70 } }),
      ]),
    )
    expect(index.hitAll({ x: 10, y: 10 }).map((hit) => hit.nodeId)).toEqual([
      'near',
    ])
  })

  it('does not treat a transparent shape interior as a fill hit', () => {
    const transparent = layer('outline', {
      payload: {
        shape: 'rectangle',
        fill: { kind: 'none' },
        stroke: { width: 2 },
      },
    })
    expect(
      hitTestDocument(document([transparent]), { x: 10, y: 10 }),
    ).toBeUndefined()
    expect(
      hitTestDocument(document([transparent]), { x: 0, y: 10 }),
    ).toMatchObject({
      nodeId: 'outline',
      part: 'stroke',
    })
  })

  it('uses the actual star polygon instead of its rectangular bounds', () => {
    const star = layer('star', {
      localBounds: { x: 0, y: 0, width: 100, height: 100 },
      payload: {
        shape: 'star',
        fill: {
          kind: 'solid',
          color: { red: 1, green: 0, blue: 0, alpha: 1 },
          opacity: 1,
        },
        stroke: { width: 2 },
        starPoints: 5,
        starInnerRatio: 0.3,
      },
    })
    expect(hitTestDocument(document([star]), { x: 50, y: 45 })).toMatchObject({
      part: 'fill',
    })
    expect(hitTestDocument(document([star]), { x: 4, y: 4 })).toBeUndefined()
  })

  it('hit-tests all three segments of an elbow through shared path points', () => {
    const elbow: EditorDocumentV1['layers'][number] = {
      id: 'elbow',
      kind: 'arrow' as const,
      localBounds: { x: 0, y: 0, width: 100, height: 100 },
      transform,
      opacity: 1,
      visible: true,
      locked: false,
      payload: {
        path: 'elbow',
        start: { x: 10, y: 10 },
        end: { x: 90, y: 90 },
        elbow: { axis: 'y', offset: -10 },
        startCap: 'none',
        endCap: 'solidArrow',
        stroke: {
          color: { red: 1, green: 0, blue: 0, alpha: 1 },
          width: 4,
          style: 'dashed',
          cap: 'round',
          join: 'round',
        },
      },
    }

    for (const point of [
      { x: 25, y: 10 },
      { x: 40, y: 50 },
      { x: 70, y: 90 },
    ]) {
      expect(hitTestDocument(document([elbow]), point)).toMatchObject({
        nodeId: 'elbow',
        part: 'stroke',
      })
    }
    expect(hitTestDocument(document([elbow]), { x: 70, y: 50 })).toBeUndefined()
  })

  it('hits a 10 px Arrow cap outside its previous local bounds after rebasing', () => {
    const before: Extract<
      EditorDocumentV1['layers'][number],
      { kind: 'arrow' }
    > = {
      id: 'wide-cap',
      kind: 'arrow',
      localBounds: { x: 0, y: 0, width: 60, height: 20 },
      transform: { ...transform, translateX: 10, translateY: 10 },
      opacity: 1,
      visible: true,
      locked: false,
      payload: {
        path: 'straight',
        start: { x: 0, y: 0 },
        end: { x: 60, y: 20 },
        startCap: 'none',
        endCap: 'solidArrow',
        stroke: {
          color: { red: 1, green: 0, blue: 0, alpha: 1 },
          width: 3,
          style: 'solid',
          cap: 'round',
          join: 'round',
        },
      },
    }
    const after = rebaseArrowLayer(before, {
      ...before.payload,
      stroke: { ...before.payload.stroke, width: 10 },
    })

    expect(
      hitTestDocument(document([before]), { x: 95, y: 30 }),
    ).toBeUndefined()
    expect(hitTestDocument(document([after]), { x: 95, y: 30 })).toMatchObject({
      nodeId: 'wide-cap',
      part: 'stroke',
    })
  })
})
