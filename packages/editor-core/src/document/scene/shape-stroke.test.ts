import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from '../../drawing'
import { shapeNodes } from './drawing'
import type { ShapeLayer } from '../types'
import { createRenderSceneSnapshot } from '../../scene/snapshot'

describe('shape stroke propagation', () => {
  it('freezes zero-length round dot intervals and rejects zero gaps or all-zero patterns', () => {
    const node = { kind: 'rect' as const, id: 'dots', x: 0, y: 0, width: 100, height: 80, rotation: 0,
      opacity: 1, visible: true, fill: { red: 0, green: 0, blue: 0, alpha: 0 },
      lineCap: 'round' as const, dash: [0, 8] }
    const scene = createRenderSceneSnapshot({ width: 200, height: 200, nodes: [node] })
    expect('dash' in scene.nodes[0]! && Object.isFrozen(scene.nodes[0].dash)).toBe(true)
    for (const dash of [[0, 0], [4, 0], [-1, 8]]) {
      expect(() => createRenderSceneSnapshot({
        width: 200, height: 200, nodes: [{ ...node, dash }],
      })).toThrow()
    }
  })
  for (const shape of ['rectangle', 'circle', 'oval', 'diamond', 'star', 'braceLeft', 'cylinder']) {
    for (const style of ['solid', 'dashed', 'dotted'] as const) {
      it(`${shape} carries ${style} through its scene node`, () => {
        const layer = createDrawingLayer({
          id: '019c1f62-058e-7000-8000-000000000004', tool: 'shape',
          start: { x: 10, y: 10 }, end: { x: 210, y: 160 },
          defaults: { ...DEFAULT_DRAWING_DEFAULTS, shape: {
            ...DEFAULT_DRAWING_DEFAULTS.shape, shape,
            stroke: { ...DEFAULT_DRAWING_DEFAULTS.shape.stroke as object, width: 4, style },
          } },
        }) as ShapeLayer
        const node = shapeNodes(layer)[0]!
        expect(node).toMatchObject({ strokeWidth: 4 })
        expect('dash' in node ? node.dash : undefined).toEqual(style === 'solid' ? undefined : style === 'dashed' ? [12, 8] : [0, 8])
        if (style === 'dotted') expect(node).toMatchObject({ lineCap: 'round' })
      })
    }
  }
})
