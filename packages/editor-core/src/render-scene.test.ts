import { describe, expect, it } from 'vitest'

import { createRenderSceneSnapshot } from './index'

describe('render scene validation', () => {
  it('freezes a canvas-space output bounds contract and defaults to the full canvas', () => {
    const full = createRenderSceneSnapshot({
      width: 100,
      height: 80,
      nodes: [],
    })
    expect(full.outputBounds).toEqual({ x: 0, y: 0, width: 100, height: 80 })

    const cropped = createRenderSceneSnapshot({
      width: 100,
      height: 80,
      outputBounds: { x: 12, y: 8, width: 40, height: 30 },
      nodes: [],
    })
    expect(cropped.outputBounds).toEqual({ x: 12, y: 8, width: 40, height: 30 })
    expect(Object.isFrozen(cropped.outputBounds)).toBe(true)
    expect(() =>
      createRenderSceneSnapshot({
        width: 100,
        height: 80,
        outputBounds: { x: 90, y: 0, width: 20, height: 30 },
        nodes: [],
      }),
    ).toThrow(/outputBounds/u)
  })

  it('rejects non-finite geometry and freezes optional stroke data', () => {
    expect(() =>
      createRenderSceneSnapshot({
        width: 100,
        height: 100,
        nodes: [
          {
            kind: 'rect',
            id: 'rect',
            x: Number.NaN,
            y: 0,
            width: 10,
            height: 10,
            rotation: 0,
            opacity: 1,
            visible: true,
            fill: { red: 0, green: 0, blue: 0, alpha: 1 },
          },
        ],
      }),
    ).toThrow(/rect\.x/u)

    const scene = createRenderSceneSnapshot({
      width: 100,
      height: 100,
      nodes: [
        {
          kind: 'ellipse',
          id: 'ellipse',
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
          rotation: 0,
          opacity: 1,
          visible: true,
          fill: { red: 0, green: 0, blue: 0, alpha: 1 },
          stroke: { red: 1, green: 1, blue: 1, alpha: 1 },
          strokeWidth: 2,
        },
      ],
    })

    const first = scene.nodes[0]
    if (!first || first.kind !== 'ellipse') throw new Error('ellipse missing')
    expect(Object.isFrozen(first.stroke)).toBe(true)
  })
})
