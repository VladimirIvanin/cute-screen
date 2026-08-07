import { loadImage } from '@napi-rs/canvas'
import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import CanvasKitInit from 'canvaskit-wasm'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { renderHeadlessCanvasKitPng } from './canvaskit'

describe('CanvasKit headless renderer', () => {
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
})
