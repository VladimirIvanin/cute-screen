import { describe, expect, it } from 'vitest'

import { createDocumentRenderScene } from './index'
import { documentFixture as document } from './test-kit'

describe('document render scene: drawing nodes', () => {
  it('compiles alternating inner and outer star points', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000004',
          kind: 'shape',
          localBounds: { x: 0, y: 0, width: 100, height: 100 },
          transform: { ...document.layers[0]!.transform },
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          shadows: [],
          payload: {
            shape: 'star',
            fill: { kind: 'none' },
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 2,
              style: 'solid',
              cap: 'butt',
              join: 'miter',
            },
            cornerRadius: 0,
            starPoints: 5,
            starInnerRatio: 0.4,
          },
        },
      ],
    })
    const star = scene.nodes[0]
    expect(star).toMatchObject({ kind: 'polygon' })
    if (star?.kind !== 'polygon') throw new Error('expected a polygon')
    expect(star.points).toHaveLength(10)
    expect(star.points[0]!.y).toBeLessThan(star.points[1]!.y)
  })

  it('uses sampled pen pressure and renders a one-point marker as a dot', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000005',
          kind: 'pencil',
          localBounds: { x: 0, y: 0, width: 40, height: 20 },
          transform: { ...document.layers[0]!.transform },
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          shadows: [],
          payload: {
            brush: 'pen',
            width: 10,
            color: { red: 1, green: 0, blue: 0, alpha: 1 },
            smoothing: 0.5,
            points: [
              { x: 0, y: 0, pressure: 0.2 },
              { x: 20, y: 0, pressure: 0.6 },
            ],
          },
        },
        {
          id: '019c1f62-058e-7000-8000-000000000006',
          kind: 'marker',
          localBounds: { x: 0, y: 0, width: 20, height: 20 },
          transform: { ...document.layers[0]!.transform },
          opacity: 0.35,
          visible: true,
          locked: false,
          blendMode: 'multiply',
          shadows: [],
          payload: {
            width: 18,
            color: { red: 1, green: 0, blue: 0, alpha: 1 },
            smoothing: 0.5,
            points: [{ x: 10, y: 10, pressure: 0.5 }],
          },
        },
      ],
    })
    expect(scene.nodes[0]).toMatchObject({ kind: 'line', strokeWidth: 4 })
    expect(scene.nodes[1]).toMatchObject({ kind: 'ellipse', radiusX: 9 })
  })

  it('compiles a multi-point marker into one contiguous round path', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000008',
          kind: 'marker',
          localBounds: { x: 0, y: 0, width: 48, height: 28 },
          transform: { ...document.layers[0]!.transform },
          opacity: 0.35,
          visible: true,
          locked: false,
          blendMode: 'multiply',
          shadows: [],
          payload: {
            width: 18,
            color: { red: 1, green: 0.8, blue: 0, alpha: 1 },
            smoothing: 0.5,
            points: [
              { x: 6, y: 8, pressure: 0.5 },
              { x: 24, y: 20, pressure: 0.5 },
              { x: 42, y: 8, pressure: 0.5 },
            ],
          },
        },
      ],
    })

    expect(scene.nodes).toEqual([
      expect.objectContaining({
        kind: 'path',
        lineCap: 'round',
        lineJoin: 'round',
        points: [
          { x: 18, y: 24 },
          { x: 36, y: 36 },
          { x: 54, y: 24 },
        ],
      }),
    ])
  })

  it('keeps an image texture as a renderer resource reference', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000007',
          kind: 'shape',
          localBounds: { x: 0, y: 0, width: 40, height: 20 },
          transform: { ...document.layers[0]!.transform },
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          shadows: [],
          payload: {
            shape: 'rectangle',
            fill: {
              kind: 'imageTexture',
              blobHash: 'b'.repeat(64),
              format: 'png',
              intrinsicWidth: 4,
              intrinsicHeight: 4,
              fit: 'repeat',
              transform: {
                scale: 2,
                rotation: 15,
                offsetX: 0.25,
                offsetY: 0.5,
              },
              opacity: 0.6,
            },
            stroke: {
              color: { red: 0, green: 0, blue: 0, alpha: 1 },
              width: 2,
              style: 'solid',
              cap: 'butt',
              join: 'miter',
            },
            cornerRadius: 0,
            starPoints: 5,
            starInnerRatio: 0.5,
          },
        },
      ],
    })
    expect(scene.nodes[0]).toMatchObject({
      kind: 'rect',
      fill: {
        kind: 'imageTexture',
        resourceId: 'b'.repeat(64),
        opacity: 0.6,
        scale: 2,
      },
    })
  })

  it('clamps and compiles rectangle corner radius into the shared scene', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000008',
          kind: 'shape',
          localBounds: { x: 0, y: 0, width: 24, height: 14 },
          transform: { ...document.layers[0]!.transform },
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          shadows: [],
          payload: {
            shape: 'rectangle',
            fill: { kind: 'none' },
            stroke: {
              color: { red: 0, green: 0, blue: 0, alpha: 1 },
              width: 2,
              style: 'solid',
              cap: 'butt',
              join: 'miter',
            },
            cornerRadius: 100,
            starPoints: 5,
            starInnerRatio: 0.5,
          },
        },
      ],
    })
    expect(scene.nodes[0]).toMatchObject({ kind: 'rect', cornerRadius: 6 })
  })
})
