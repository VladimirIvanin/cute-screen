import { describe, expect, it } from 'vitest'

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
})
