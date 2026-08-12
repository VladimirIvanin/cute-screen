import { createCanvas, loadImage } from '@napi-rs/canvas'
import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import CanvasKitInit from 'canvaskit-wasm'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { renderHeadlessCanvasKitPng } from './canvaskit'

describe('CanvasKit headless renderer', () => {
  it('applies a shared negative layer scale to vector annotations', async () => {
    const canvasKit = (await CanvasKitInit({
      locateFile: () =>
        path.resolve(
          process.cwd(),
          'packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
        ),
    })) as import('./canvaskit').CanvasKitApi
    const png = renderHeadlessCanvasKitPng(
      canvasKit,
      createRenderSceneSnapshot({
        width: 64,
        height: 64,
        nodes: [
          {
            kind: 'rect',
            id: 'annotation',
            x: 8,
            y: 8,
            width: 8,
            height: 8,
            rotation: 0,
            scaleX: 1,
            scaleY: -1,
            transformOriginX: 0,
            transformOriginY: 32,
            opacity: 1,
            visible: true,
            fill: { red: 1, green: 0, blue: 0, alpha: 1 },
          },
        ],
      }),
    )
    const image = await loadImage(png)
    const canvas = createCanvas(image.width, image.height)
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)

    expect(context.getImageData(12, 52, 1, 1).data[3]).toBeGreaterThan(0)
    expect(context.getImageData(12, 12, 1, 1).data[3]).toBe(0)
  })

  it('renders a contiguous marker path headlessly', async () => {
    const canvasKit = (await CanvasKitInit({
      locateFile: () =>
        path.resolve(
          process.cwd(),
          'packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
        ),
    })) as import('./canvaskit').CanvasKitApi
    const png = renderHeadlessCanvasKitPng(
      canvasKit,
      createRenderSceneSnapshot({
        width: 64,
        height: 64,
        nodes: [
          {
            kind: 'path',
            id: 'marker',
            points: [
              { x: 8, y: 8 },
              { x: 32, y: 40 },
              { x: 56, y: 8 },
            ],
            rotation: 0,
            opacity: 0.35,
            visible: true,
            blendMode: 'multiply',
            stroke: { red: 1, green: 0.8, blue: 0, alpha: 1 },
            strokeWidth: 18,
            lineCap: 'round',
            lineJoin: 'round',
          },
        ],
      }),
    )

    const decoded = await loadImage(png)
    expect([decoded.width, decoded.height]).toEqual([64, 64])
  })

  it('creates a software surface and returns decoded PNG bytes', async () => {
    const canvasKit = (await CanvasKitInit({
      locateFile: () =>
        path.resolve(
          process.cwd(),
          'packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
        ),
    })) as import('./canvaskit').CanvasKitApi
    const scene = createRenderSceneSnapshot({
      width: 64,
      height: 32,
      nodes: [
        {
          kind: 'ellipse',
          id: 'ellipse',
          centerX: 20,
          centerY: 16,
          radiusX: 12,
          radiusY: 8,
          rotation: 0,
          opacity: 1,
          visible: true,
          fill: { red: 0, green: 0.5, blue: 1, alpha: 1 },
        },
      ],
    })

    const png = renderHeadlessCanvasKitPng(canvasKit, scene)
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const decoded = await loadImage(png)
    expect([decoded.width, decoded.height]).toEqual([64, 32])
  })

  it('keeps a missing image recoverable in headless output', async () => {
    const canvasKit = (await CanvasKitInit({
      locateFile: () =>
        path.resolve(
          process.cwd(),
          'packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
        ),
    })) as import('./canvaskit').CanvasKitApi
    const png = renderHeadlessCanvasKitPng(
      canvasKit,
      createRenderSceneSnapshot({
        width: 32,
        height: 32,
        nodes: [
          {
            kind: 'image',
            id: 'missing',
            resourceId: 'not-loaded',
            x: 4,
            y: 4,
            width: 20,
            height: 20,
            scaleX: 1,
            scaleY: 1,
            cornerRadius: 8,
            stroke: { red: 0.2, green: 0.6, blue: 1, alpha: 1 },
            strokeWidth: 2,
            lineJoin: 'round',
            rotation: 0,
            opacity: 1,
            visible: true,
          },
        ],
      }),
    )
    const decoded = await loadImage(png)
    expect(decoded.width).toBe(32)
    const canvas = createCanvas(decoded.width, decoded.height)
    const context = canvas.getContext('2d')
    context.drawImage(decoded, 0, 0)
    expect(context.getImageData(4, 4, 1, 1).data[3]).toBe(0)
    expect(context.getImageData(14, 4, 1, 1).data[2]).toBeGreaterThan(0)
  })

  it('renders a renderer-neutral radial gradient headlessly', async () => {
    const canvasKit = (await CanvasKitInit({
      locateFile: () =>
        path.resolve(
          process.cwd(),
          'packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
        ),
    })) as import('./canvaskit').CanvasKitApi
    const png = renderHeadlessCanvasKitPng(
      canvasKit,
      createRenderSceneSnapshot({
        width: 32,
        height: 32,
        nodes: [
          {
            kind: 'ellipse',
            id: 'gradient',
            centerX: 16,
            centerY: 16,
            radiusX: 16,
            radiusY: 16,
            rotation: 0,
            opacity: 1,
            visible: true,
            fill: {
              kind: 'radialGradient',
              centerX: 16,
              centerY: 16,
              radius: 16,
              stops: [
                { position: 0, color: { red: 1, green: 1, blue: 1, alpha: 1 } },
                { position: 1, color: { red: 0, green: 0, blue: 0, alpha: 1 } },
              ],
            },
          },
        ],
      }),
    )
    const decoded = await loadImage(png)
    expect([decoded.width, decoded.height]).toEqual([32, 32])
  })

  it('preserves scene-node z-order across image and vector nodes', async () => {
    const canvasKit = (await CanvasKitInit({
      locateFile: () =>
        path.resolve(
          process.cwd(),
          'packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
        ),
    })) as import('./canvaskit').CanvasKitApi
    const png = renderHeadlessCanvasKitPng(
      canvasKit,
      createRenderSceneSnapshot({
        width: 64,
        height: 64,
        nodes: [
          {
            kind: 'rect',
            id: 'underlay',
            x: 12,
            y: 12,
            width: 32,
            height: 32,
            rotation: 0,
            opacity: 1,
            visible: true,
            fill: { red: 0, green: 1, blue: 0, alpha: 1 },
          },
          {
            kind: 'image',
            id: 'top-image',
            resourceId: 'missing',
            x: 12,
            y: 12,
            width: 32,
            height: 32,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            opacity: 1,
            visible: true,
          },
        ],
      }),
    )
    const image = await loadImage(png)
    const canvas = createCanvas(image.width, image.height)
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const pixel = context.getImageData(28, 28, 1, 1).data

    expect(pixel[0]).toBeGreaterThan(0)
  })
})
