import { describe, expect, it } from 'vitest'

import { createDocumentRenderScene, type EditorDocumentV1 } from '../index'

const document: EditorDocumentV1 = {
  schemaVersion: 7,
  id: '019c1f62-058e-7000-8000-000000000000',
  source: {
    blobHash: 'a'.repeat(64),
    format: 'png',
    mimeType: 'image/png',
    width: 640,
    height: 480,
    orientationApplied: true,
    provenance: 'capture',
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
      blendMode: 'normal',
      shadows: [],
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
  it('maps crop to output bounds without translating or mutating layer coordinates', () => {
    const croppedDocument: EditorDocumentV1 = {
      ...document,
      crop: { x: 120, y: 80, width: 320, height: 240 },
    }
    const before = JSON.stringify(croppedDocument)
    const scene = createDocumentRenderScene(croppedDocument)

    expect(scene.outputBounds).toEqual({
      x: 120,
      y: 80,
      width: 320,
      height: 240,
    })
    expect(scene.nodes[0]).toMatchObject({ x: 12, y: 16 })
    expect(JSON.stringify(croppedDocument)).toBe(before)
  })

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

  it('compiles content-image radius and border through the shared render node', () => {
    const base = document.layers[0]
    if (!base || base.kind !== 'image') throw new Error('expected image layer')
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          ...base,
          payload: {
            ...base.payload,
            role: 'content',
            radius: 18,
            border: {
              color: { red: 0.2, green: 0.6, blue: 1, alpha: 1 },
              width: 3,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    })

    expect(scene.nodes[0]).toMatchObject({
      kind: 'image',
      cornerRadius: 18,
      stroke: { red: 0.2, green: 0.6, blue: 1, alpha: 1 },
      strokeWidth: 3,
      lineJoin: 'round',
    })
  })

  it('compiles normalized gradient geometry into renderer-neutral canvas coordinates', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
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
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000003',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 24, height: 4 },
          transform: {
            ...document.layers[0]!.transform,
            translateX: 0,
            translateY: 0,
          },
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
            endCap: 'solidArrow',
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
      'path',
      'ellipse',
      'polygon',
    ])
    expect(scene.nodes[0]).toMatchObject({ dash: [6, 4], lineCap: 'round' })
  })

  it('keeps quadratic and elbow dashes continuous in one body path', () => {
    const scene = createDocumentRenderScene({
      ...document,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000021',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 100, height: 80 },
          transform: {
            ...document.layers[0]!.transform,
            translateX: 0,
            translateY: 0,
          },
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          shadows: [],
          payload: {
            path: 'quadratic',
            start: { x: 10, y: 60 },
            end: { x: 90, y: 60 },
            bend: { x: 50, y: 10 },
            startCap: 'none',
            endCap: 'lineArrow',
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 2,
              style: 'dashed',
              cap: 'round',
              join: 'round',
            },
          },
        },
        {
          id: '019c1f62-058e-7000-8000-000000000022',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 100, height: 80 },
          transform: {
            ...document.layers[0]!.transform,
            translateX: 0,
            translateY: 0,
          },
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          shadows: [],
          payload: {
            path: 'elbow',
            start: { x: 10, y: 10 },
            end: { x: 90, y: 70 },
            elbow: { axis: 'y', offset: -10 },
            startCap: 'circle',
            endCap: 'diamond',
            stroke: {
              color: { red: 0, green: 0, blue: 1, alpha: 1 },
              width: 3,
              style: 'dashed',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    })

    const bodies = scene.nodes.filter((node) => node.id.endsWith(':body'))
    expect(bodies).toHaveLength(2)
    expect(bodies).toEqual([
      expect.objectContaining({ kind: 'path', dash: [6, 4] }),
      expect.objectContaining({
        kind: 'path',
        points: [
          { x: 10, y: 10 },
          { x: 40, y: 10 },
          { x: 40, y: 70 },
          { x: 90, y: 70 },
        ],
        dash: [9, 6],
      }),
    ])
    expect(scene.nodes.some((node) => node.id.includes('curve:'))).toBe(false)
  })

  it('renders the outline triangle endpoint independently from the body', () => {
    const scene = createDocumentRenderScene({
      ...document,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000023',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 80, height: 30 },
          transform: {
            ...document.layers[0]!.transform,
            translateX: 0,
            translateY: 0,
          },
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          shadows: [],
          payload: {
            path: 'straight',
            start: { x: 10, y: 15 },
            end: { x: 70, y: 15 },
            startCap: 'none',
            endCap: 'triangle',
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 3,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    })

    expect(scene.nodes).toHaveLength(2)
    expect(scene.nodes[1]).toMatchObject({
      kind: 'polygon',
      fill: { alpha: 0 },
      strokeWidth: 3,
    })
  })

  it('preserves the complete transform for non-image render nodes', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000002',
          kind: 'shape',
          localBounds: { x: 0, y: 0, width: 20, height: 10 },
          transform: {
            translateX: 17,
            translateY: 23,
            rotation: 31,
            scaleX: 1.25,
            scaleY: -0.75,
          },
          opacity: 1,
          blendMode: 'normal',
          shadows: [],
          visible: true,
          locked: false,
          payload: {
            shape: 'rectangle',
            fill: { kind: 'none' },
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 2,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
            cornerRadius: 0,
            starPoints: 5,
            starInnerRatio: 0.45,
          },
        },
      ],
    })

    expect(scene.nodes[0]).toMatchObject({
      rotation: 31,
      scaleX: 1.25,
      scaleY: -0.75,
      transformOriginX: 17,
      transformOriginY: 23,
    })
  })

  it('ends a thick arrow body at the base of its solid arrow cap', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000012',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 100, height: 20 },
          transform: {
            ...document.layers[0]!.transform,
            translateX: 0,
            translateY: 0,
          },
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          shadows: [],
          payload: {
            path: 'straight',
            start: { x: 0, y: 10 },
            end: { x: 100, y: 10 },
            startCap: 'none',
            endCap: 'solidArrow',
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 20,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    })

    expect(scene.nodes[0]).toMatchObject({
      kind: 'path',
      points: [
        { x: 0, y: 10 },
        { x: 40, y: 10 },
      ],
      strokeWidth: 20,
    })
    const triangle = scene.nodes[1]
    if (!triangle || triangle.kind !== 'polygon')
      throw new Error('expected triangle cap')
    expect(triangle.points).toEqual([
      { x: 100, y: 10 },
      { x: 40, y: 43 },
      { x: 40, y: -23 },
    ])
  })

  it.each(['solidArrow', 'triangle'] as const)(
    'shrinks a %s cap when its endpoints are closer than the nominal cap length',
    (endCap) => {
      const scene = createDocumentRenderScene({
        ...document,
        schemaVersion: 7,
        layers: [
          {
            id: '019c1f62-058e-7000-8000-000000000013',
            kind: 'arrow',
            localBounds: { x: 0, y: 0, width: 22, height: 22 },
            transform: {
              ...document.layers[0]!.transform,
              translateX: 0,
              translateY: 0,
            },
            opacity: 1,
            visible: true,
            locked: false,
            blendMode: 'normal',
            shadows: [],
            payload: {
              path: 'straight',
              start: { x: 10, y: 10 },
              end: { x: 14, y: 10 },
              startCap: 'none',
              endCap,
              stroke: {
                color: { red: 1, green: 0, blue: 0, alpha: 1 },
                width: 3,
                style: 'solid',
                cap: 'round',
                join: 'round',
              },
            },
          },
        ],
      })

      expect(scene.nodes).toHaveLength(1)
      const triangle = scene.nodes[0]
      if (!triangle || triangle.kind !== 'polygon')
        throw new Error('expected triangle cap')
      expect(triangle.points[0]).toEqual({ x: 14, y: 10 })
      expect(triangle.points[1]!.x).toBeCloseTo(10)
      expect(triangle.points[2]!.x).toBeCloseTo(10)
      expect(Math.abs(triangle.points[1]!.y - 10)).toBeCloseTo(2.2)
      expect(Math.abs(triangle.points[2]!.y - 10)).toBeCloseTo(2.2)
    },
  )

  it('joins a curved body at the base of its left solid arrow cap', () => {
    const scene = createDocumentRenderScene({
      ...document,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000024',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 360, height: 140 },
          transform: {
            ...document.layers[0]!.transform,
            translateX: 0,
            translateY: 0,
          },
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          shadows: [],
          payload: {
            path: 'quadratic',
            start: { x: 24, y: 24 },
            end: { x: 336, y: 112 },
            bend: { x: 72, y: 104 },
            startCap: 'solidArrow',
            endCap: 'solidArrow',
            stroke: {
              color: { red: 1, green: 0.78, blue: 0.23, alpha: 1 },
              width: 10,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    })

    const body = scene.nodes[0]
    const startCap = scene.nodes[1]
    if (!body || body.kind !== 'path') throw new Error('expected arrow body')
    if (!startCap || startCap.kind !== 'polygon')
      throw new Error('expected solid start cap')
    const bodyStart = body.points[0]!
    const baseCenter = {
      x: (startCap.points[1]!.x + startCap.points[2]!.x) / 2,
      y: (startCap.points[1]!.y + startCap.points[2]!.y) / 2,
    }

    expect(baseCenter.x).toBeCloseTo(bodyStart.x, 10)
    expect(baseCenter.y).toBeCloseTo(bodyStart.y, 10)
    const anchor = startCap.points[0]!
    expect(
      Math.hypot(
        anchor.x - startCap.points[1]!.x,
        anchor.y - startCap.points[1]!.y,
      ),
    ).toBeCloseTo(
      Math.hypot(
        anchor.x - startCap.points[2]!.x,
        anchor.y - startCap.points[2]!.y,
      ),
      10,
    )
  })

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

  it('compiles v7 runs and paragraph metadata into a renderer-neutral node', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000009',
          kind: 'text',
          localBounds: { x: 0, y: 0, width: 120, height: 48 },
          transform: {
            ...document.layers[0]!.transform,
            translateX: 12,
            translateY: 18,
          },
          visible: true,
          locked: false,
          payload: {
            content: {
              text: 'Привет\nworld',
              wrap: 'fixedWidth',
              fixedWidth: 120,
              spans: [
                {
                  start: 0,
                  end: 12,
                  fontFamily: 'Cute Sans',
                  fontSize: 20,
                  color: { red: 0.2, green: 0.3, blue: 0.4, alpha: 1 },
                  weight: 600,
                  italic: true,
                  strikethrough: true,
                },
              ],
              paragraphs: [
                {
                  start: 0,
                  end: 12,
                  alignment: 'center',
                  listKind: 'bullet',
                },
              ],
            },
            background: null,
          },
        },
      ],
    })

    expect(scene.nodes).toEqual([
      expect.objectContaining({
        kind: 'text',
        text: 'Привет\nworld',
        x: 12,
        y: 18,
        width: 120,
        wrap: 'fixedWidth',
        runs: [
          {
            start: 0,
            end: 12,
            fontFamily: 'Cute Sans',
            fontSize: 20,
            color: { red: 0.2, green: 0.3, blue: 0.4, alpha: 1 },
            fontWeight: 600,
            fontStyle: 'italic',
            strikethrough: true,
          },
        ],
        paragraphs: [
          {
            start: 0,
            end: 12,
            alignment: 'center',
            listKind: 'bullet',
          },
        ],
        opacity: 1,
        blendMode: 'normal',
      }),
    ])
  })

  it('renders a text background through the shared rectangle paint primitive', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000019',
          kind: 'text',
          localBounds: { x: 0, y: 0, width: 120, height: 24 },
          transform: {
            ...document.layers[0]!.transform,
            translateX: 20,
            translateY: 30,
          },
          visible: true,
          locked: false,
          payload: {
            content: {
              text: 'Label',
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
                  listKind: 'none',
                },
              ],
            },
            background: {
              color: { red: 1, green: 0.8, blue: 0.2, alpha: 1 },
              padding: 6,
              radius: 4,
            },
          },
        },
      ],
    })

    expect(scene.nodes).toEqual([
      expect.objectContaining({
        kind: 'rect',
        id: '019c1f62-058e-7000-8000-000000000019:background',
        x: 14,
        y: 24,
        width: 132,
        height: 36,
        cornerRadius: 4,
      }),
      expect.objectContaining({
        kind: 'text',
        id: '019c1f62-058e-7000-8000-000000000019',
      }),
    ])
  })

  it('compiles a numbered marker body and readable label from its stable sequence', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000010',
          kind: 'numberedMarker',
          localBounds: { x: 0, y: 0, width: 32, height: 32 },
          transform: { ...document.layers[0]!.transform },
          visible: true,
          locked: false,
          payload: {
            sequence: 7,
            label: {
              text: '7',
              wrap: 'autoSize',
              spans: [
                {
                  start: 0,
                  end: 1,
                  fontFamily: 'Roboto',
                  fontSize: 16,
                  color: { red: 1, green: 1, blue: 1, alpha: 1 },
                  weight: 700,
                  italic: false,
                  strikethrough: false,
                },
              ],
              paragraphs: [
                {
                  start: 0,
                  end: 1,
                  alignment: 'center',
                  listKind: 'none',
                },
              ],
            },
            badge: {
              shape: 'diamond',
              color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 },
            },
          },
        },
      ],
    })

    expect(scene.nodes).toEqual([
      expect.objectContaining({
        kind: 'polygon',
        id: expect.stringMatching(/:body$/u),
      }),
      expect.objectContaining({
        kind: 'text',
        id: expect.stringMatching(/:label$/u),
        text: '7',
        x: 12,
        y: 16,
        width: 32,
        height: 32,
        runs: [expect.objectContaining({ fontFamily: 'Roboto' })],
        paragraphs: [expect.objectContaining({ alignment: 'center' })],
        verticalAlign: 'visualCenter',
      }),
    ])
  })

  it('keeps callout connector, markers and multiline text in one ordered scene object', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000011',
          kind: 'callout',
          localBounds: { x: 0, y: 0, width: 180, height: 120 },
          transform: { ...document.layers[0]!.transform },
          visible: true,
          locked: false,
          payload: {
            content: {
              text: 'Line one\nLine two',
              wrap: 'autoSize',
              spans: [
                {
                  start: 0,
                  end: 17,
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
                  end: 17,
                  alignment: 'start',
                  listKind: 'none',
                },
              ],
            },
            background: null,
            target: { x: 20, y: 90 },
            label: { x: 120, y: 40 },
            route: {
              path: 'elbow',
              elbow: { axis: 'y', offset: 0 },
            },
            stroke: {
              color: { red: 0.5, green: 0.5, blue: 0.5, alpha: 1 },
              width: 2,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
            targetMarker: 'circle',
            labelMarker: 'circle',
          },
        },
      ],
    })

    expect(scene.nodes.map((node) => node.kind)).toEqual([
      'path',
      'ellipse',
      'ellipse',
      'text',
    ])
    expect(scene.nodes[0]).toMatchObject({
      id: expect.stringMatching(/:connector$/u),
    })
    expect(scene.nodes[3]).toMatchObject({
      text: 'Line one\nLine two',
      runs: [expect.objectContaining({ fontFamily: 'Roboto', fontSize: 24 })],
      paragraphs: [
        expect.objectContaining({ alignment: 'start', listKind: 'none' }),
      ],
    })
  })
})
