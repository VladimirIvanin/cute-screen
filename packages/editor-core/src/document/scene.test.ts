import { describe, expect, it } from 'vitest'

import { createDocumentRenderScene, type EditorDocumentV1 } from '../index'

const document: EditorDocumentV1 = {
  schemaVersion: 2,
  id: '019c1f62-058e-7000-8000-000000000000',
  source: {
    blobHash: 'a'.repeat(64),
    format: 'png',
    mimeType: 'image/png',
    width: 640,
    height: 480,
    orientationApplied: true,
    color: { colorSpace: 'srgb', hasIccProfile: false },
  },
  canvas: { width: 800, height: 600 },
  crop: null,
  layers: [
    {
      id: '019c1f62-058e-7000-8000-000000000001',
      kind: 'image',
      localBounds: { x: 0, y: 0, width: 640, height: 480 },
      transform: {
        translateX: 12,
        translateY: 16,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      opacity: 1,
      visible: true,
      locked: true,
      payload: {
        blobHash: 'a'.repeat(64),
        intrinsicWidth: 640,
        intrinsicHeight: 480,
        format: 'png',
        orientationApplied: true,
        color: { colorSpace: 'srgb', hasIccProfile: false },
        role: 'base',
      },
    },
  ],
  presentation: { beautify: { enabled: false }, watermark: { enabled: false } },
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
}

describe('document render scene', () => {
  it('renders the base layer in normal z-order instead of a background pass', () => {
    const scene = createDocumentRenderScene(document)
    expect(scene).toMatchObject({
      width: 800,
      height: 600,
      nodes: [
        {
          kind: 'image',
          resourceId: 'a'.repeat(64),
          x: 12,
          y: 16,
          width: 640,
          height: 480,
        },
      ],
    })
    expect('background' in scene).toBe(false)
  })

  it('compiles normalized gradient geometry into renderer-neutral canvas coordinates', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 3,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000002',
          kind: 'shape',
          localBounds: { x: 0, y: 0, width: 104, height: 54 },
          transform: {
            ...document.layers[0]!.transform,
            translateX: 10,
            translateY: 20,
          },
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'screen',
          shadows: [],
          payload: {
            shape: 'rectangle',
            fill: {
              kind: 'linearGradient',
              start: { x: 0, y: 0 },
              end: { x: 1, y: 1 },
              opacity: 1,
              stops: [
                { position: 0, color: { red: 1, green: 0, blue: 0, alpha: 1 } },
                { position: 1, color: { red: 0, green: 0, blue: 1, alpha: 1 } },
              ],
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
      blendMode: 'screen',
      fill: {
        kind: 'linearGradient',
        startX: 11,
        startY: 21,
        endX: 113,
        endY: 73,
      },
    })
  })

  it('compiles independent arrow caps into the ordered render scene', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 3,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000003',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 24, height: 4 },
          transform: { ...document.layers[0]!.transform },
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          shadows: [],
          payload: {
            path: 'straight',
            start: { x: 2, y: 2 },
            end: { x: 22, y: 2 },
            startCap: 'circle',
            endCap: 'triangle',
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 2,
              style: 'dashed',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    })
    expect(scene.nodes.map((node) => node.kind)).toEqual([
      'line',
      'ellipse',
      'polygon',
    ])
    expect(scene.nodes[0]).toMatchObject({ dash: [6, 4], lineCap: 'round' })
  })

  it('compiles alternating inner and outer star points', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 3,
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
      schemaVersion: 3,
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
      schemaVersion: 3,
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
      schemaVersion: 3,
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
      schemaVersion: 3,
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
