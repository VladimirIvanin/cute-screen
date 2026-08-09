import { describe, expect, it } from 'vitest'

import { createRenderSceneSnapshot } from './index'

describe('render scene validation', () => {
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

    expect(Object.isFrozen(scene.nodes[0]?.stroke)).toBe(true)
  })
})
