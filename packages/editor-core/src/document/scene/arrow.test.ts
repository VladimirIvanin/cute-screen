import { describe, expect, it } from 'vitest'

import { createDocumentRenderScene } from './index'
import { documentFixture as document } from './test-kit'

describe('document render scene: arrows', () => {
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
})
