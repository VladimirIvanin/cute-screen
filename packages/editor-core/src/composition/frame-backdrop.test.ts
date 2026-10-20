import {
  expect,
  it,
} from 'vitest'
import { documentFixture } from '../document/scene/test-kit'
import { createDocumentRenderScene } from '../document/scene'
import { createRenderSceneSnapshot } from '../scene/snapshot'
import type { RenderGroupNode } from '../scene/contracts'
import { createComposition } from './defaults'

it.each(['phone', 'window', 'browser'] as const)('composites the %s screen color inside the content group', (kind) => {
  const base = createComposition('phone')
  const composition = { ...base, frame: { ...base.frame, kind } }
  const scene = createDocumentRenderScene({ ...documentFixture,
    presentation: { ...documentFixture.presentation, composition } })
  const content = scene.nodes.find((node) => node.id === 'card:content') as RenderGroupNode
  expect(content.backdrop).toEqual(composition.frame.screenColor)
  expect(scene.nodes.some((node) => node.id === 'card:screen')).toBe(false)
  expect(content.scene.nodes.length).toBeGreaterThan(0)
})

it('copies, validates and freezes a group backdrop without retaining mutable input', () => {
  const backdrop = { red: 0.8, green: 0.6, blue: 0.2, alpha: 0.5 }
  const bounds = { x: 0, y: 0, width: 30, height: 20 }
  const input = { id: 'screen', kind: 'group' as const, scene: createRenderSceneSnapshot({ width: 30, height: 20, nodes: [] }),
    destination: bounds, clip: bounds, cornerRadius: 3, backdrop, blur: 0, visible: true, opacity: 1, rotation: 0 }
  const scene = createRenderSceneSnapshot({ width: 30, height: 20, nodes: [input] })
  const group = scene.nodes[0] as RenderGroupNode
  expect(group.backdrop).not.toBe(backdrop)
  expect(Object.isFrozen(group.backdrop)).toBe(true)
  backdrop.red = 0
  expect(group.backdrop?.red).toBe(0.8)
  for (const invalid of [-0.1, 1.1, NaN, Infinity]) {
    expect(() => createRenderSceneSnapshot({ width: 30, height: 20,
      nodes: [{ ...input, backdrop: { ...backdrop, alpha: invalid } }] })).toThrow()
  }
})
