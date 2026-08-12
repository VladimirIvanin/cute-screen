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

  it('compiles content-image radius and border through the shared render node', () => {
    const base = document.layers[0]
    if (!base || base.kind !== 'image') throw new Error('expected image layer')
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 4,
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

  it('ends a thick arrow body at the base of its triangle cap', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 3,
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
            endCap: 'triangle',
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
      kind: 'line',
      x1: 0,
      y1: 10,
      x2: 40,
      y2: 10,
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

  it('compiles committed multiline text into a renderer-neutral node', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 4,
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
          opacity: 0.8,
          visible: true,
          locked: false,
          blendMode: 'screen',
          shadows: [
            {
              color: { red: 0, green: 0, blue: 0, alpha: 0.4 },
              offsetX: 2,
              offsetY: 3,
              blur: 4,
            },
          ],
          payload: {
            content: {
              text: 'Привет\nworld',
              wrap: 'fixedWidth',
              fixedWidth: 120,
              spans: [
                {
                  start: 0,
                  end: 12,
                  fontSize: 20,
                  underline: true,
                  letterSpacing: 2,
                },
              ],
              paragraphs: [{ start: 0, end: 12, alignment: 'center' }],
            },
            font: {
              source: 'bundled',
              family: 'Cute Sans',
              weight: 600,
              style: 'italic',
            },
            fill: {
              kind: 'solid',
              color: { red: 0.2, green: 0.3, blue: 0.4, alpha: 1 },
              opacity: 1,
            },
            outline: null,
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
        fontSize: 20,
        fontFamily: 'Cute Sans',
        fontWeight: 600,
        fontStyle: 'italic',
        underline: true,
        letterSpacing: 2,
        align: 'center',
        opacity: 0.8,
        blendMode: 'screen',
        shadows: [
          {
            color: { red: 0, green: 0, blue: 0, alpha: 0.4 },
            offsetX: 2,
            offsetY: 3,
            blur: 4,
          },
        ],
      }),
    ])
  })

  it('renders a text background through the shared rectangle paint primitive', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 4,
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
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          shadows: [],
          payload: {
            content: {
              text: 'Label',
              wrap: 'autoSize',
              spans: [],
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
            background: {
              fill: {
                kind: 'solid',
                color: { red: 1, green: 0.8, blue: 0.2, alpha: 1 },
                opacity: 1,
              },
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

  it('compiles a text outline into shared renderer stroke fields', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 4,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000020',
          kind: 'text',
          localBounds: { x: 0, y: 0, width: 120, height: 24 },
          transform: { ...document.layers[0]!.transform },
          opacity: 1,
          visible: true,
          locked: false,
          blendMode: 'normal',
          shadows: [],
          payload: {
            content: {
              text: 'Outlined',
              wrap: 'autoSize',
              spans: [],
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
              color: { red: 1, green: 1, blue: 1, alpha: 1 },
              opacity: 1,
            },
            outline: {
              stroke: {
                color: { red: 0, green: 0, blue: 0, alpha: 1 },
                width: 2,
                style: 'solid',
                cap: 'round',
                join: 'round',
              },
              position: 'center',
            },
            background: null,
          },
        },
      ],
    })

    expect(scene.nodes).toEqual([
      expect.objectContaining({
        kind: 'text',
        stroke: { red: 0, green: 0, blue: 0, alpha: 1 },
        strokeWidth: 2,
        lineJoin: 'round',
      }),
    ])
  })

  it('compiles a numbered marker body and readable label from its stable sequence', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 4,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000010',
          kind: 'numberedMarker',
          localBounds: { x: 0, y: 0, width: 32, height: 32 },
          transform: { ...document.layers[0]!.transform },
          opacity: 1,
          visible: true,
          locked: false,
          shadows: [],
          payload: {
            sequence: 7,
            shape: 'diamond',
            label: { text: '7', wrap: 'autoSize', spans: [], paragraphs: [] },
            fill: {
              kind: 'solid',
              color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 },
              opacity: 1,
            },
            outline: null,
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
        align: 'center',
      }),
    ])
  })

  it('keeps callout bubble, separate tail and multiline text in one ordered scene object', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 4,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000011',
          kind: 'callout',
          localBounds: { x: 0, y: 0, width: 120, height: 48 },
          transform: { ...document.layers[0]!.transform },
          opacity: 1,
          visible: true,
          locked: false,
          shadows: [],
          payload: {
            content: {
              text: 'Line one\nLine two',
              wrap: 'autoSize',
              spans: [],
              paragraphs: [],
            },
            font: {
              source: 'bundled',
              family: 'Inter',
              weight: 400,
              style: 'normal',
            },
            fill: {
              kind: 'solid',
              color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 },
              opacity: 1,
            },
            outline: null,
            padding: 8,
            radius: 10,
            tailAnchor: { x: 20, y: 70 },
          },
        },
      ],
    })

    expect(scene.nodes.map((node) => node.kind)).toEqual([
      'rect',
      'polygon',
      'text',
    ])
    expect(scene.nodes[1]).toMatchObject({
      id: expect.stringMatching(/:tail$/u),
    })
    const tail = scene.nodes[1]
    if (!tail || tail.kind !== 'polygon') throw new Error('expected tail')
    const baseCenterX = (tail.points[0]!.x + tail.points[1]!.x) / 2
    // The separate anchor is left of the bubble centre, so the attachment
    // follows it instead of using a fixed bottom-centre tail.
    expect(baseCenterX).toBeLessThan(72)
    expect(scene.nodes[2]).toMatchObject({ text: 'Line one\nLine two' })
  })
})
