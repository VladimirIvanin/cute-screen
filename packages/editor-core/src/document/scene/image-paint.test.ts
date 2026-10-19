import {
  describe,
  expect,
  it,
} from 'vitest'

import type { EditorDocumentV1 } from '../types'
import { createDocumentRenderScene } from './index'
import { documentFixture as document } from './test-kit'

describe('document render scene: images and paints', () => {
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
      lineJoin: 'miter',
    })
  })

  it.each(['round', 'bevel', 'miter'] as const)('keeps zero-radius image borders square with persisted %s joins', (join) => {
    const base = document.layers[0]
    if (!base || base.kind !== 'image') throw new Error('expected image layer')
    const image = {
      ...base,
      payload: {
        ...base.payload,
        radius: 0,
        border: {
          color: { red: 1, green: 0.4, blue: 0.3, alpha: 1 },
          width: 26,
          style: 'solid' as const,
          cap: 'round' as const,
          join,
        },
      },
    }
    const before = JSON.stringify(image)
    const scene = createDocumentRenderScene({ ...document, layers: [image] })
    expect(scene.nodes[0]).toMatchObject({ kind: 'image', strokeWidth: 26, lineJoin: 'miter' })
    expect(scene.nodes[0]).not.toHaveProperty('cornerRadius')
    expect(JSON.stringify(image)).toBe(before)
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
})

it('transforms a nonzero image bounds origin before applying image rotation and reflection', () => {
  const base = document.layers[0]!
  const image = { ...base, localBounds: { x: -30, y: 20, width: 90, height: 60 },
    transform: { translateX: 200, translateY: 150, rotation: 90, scaleX: -2, scaleY: 3 } }
  const node = createDocumentRenderScene({ ...document, layers: [image] }).nodes[0]!
  if (node.kind !== 'image') throw new Error('expected image node')
  expect(node.x).toBeCloseTo(140)
  expect(node.y).toBeCloseTo(210)
  expect(node).toMatchObject({ width: 90, height: 60, rotation: 90, scaleX: -2, scaleY: 3 })
})
