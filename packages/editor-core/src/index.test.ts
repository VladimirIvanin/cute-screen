import { describe, expect, it } from 'vitest'

import { createRenderSceneSnapshot } from './index'

describe('M01 render scene snapshot', () => {
  it('creates an immutable, DOM-free snapshot', () => {
    const scene = createRenderSceneSnapshot({
      width: 3840,
      height: 2160,
      background: { resourceId: 'fixture-4k', width: 3840, height: 2160 },
      nodes: [
        {
          kind: 'rect',
          id: 'rect-1',
          x: 10,
          y: 20,
          width: 100,
          height: 50,
          rotation: 0,
          opacity: 1,
          visible: true,
          fill: { red: 0.9, green: 0.2, blue: 0.1, alpha: 1 },
        },
      ],
    })

    expect(scene).toMatchObject({ width: 3840, height: 2160 })
    expect(Object.isFrozen(scene)).toBe(true)
    expect(Object.isFrozen(scene.nodes)).toBe(true)
    expect(Object.isFrozen(scene.nodes[0])).toBe(true)
  })

  it('rejects invalid geometry and duplicate node IDs', () => {
    expect(() =>
      createRenderSceneSnapshot({ width: 0, height: 100, nodes: [] }),
    ).toThrow(/width/u)

    const node = {
      kind: 'line' as const,
      id: 'duplicate',
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 10,
      strokeWidth: 2,
      rotation: 0,
      opacity: 1,
      visible: true,
      stroke: { red: 0, green: 0, blue: 0, alpha: 1 },
    }
    expect(() =>
      createRenderSceneSnapshot({
        width: 100,
        height: 100,
        nodes: [node, node],
      }),
    ).toThrow(/duplicate/u)
  })
})
