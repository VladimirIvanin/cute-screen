import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  createDocumentRenderScene,
  type ImageLayer,
} from '@cute-screen/editor-core'
import {
  Canvas2DRenderer,
  type Canvas2DLike,
} from '@cute-screen/editor-renderer'
import type { CanvasKitImage } from '../../../packages/editor-renderer/src/backends/canvaskit/contracts'
import { CanvasKitTypefaceStore } from '../../../packages/editor-renderer/src/backends/canvaskit/geometry'
import { renderCanvasKitPng } from '../../../packages/editor-renderer/src/backends/canvaskit/scene'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import {
  canvasKit,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import { rgba } from './golden-assertion-test-kit'
import { compareRgba } from './golden'

beforeAll(prepareGoldenRuntime)

describe('image border corners', () => {
  it.each([26, 32])('uses only radius for corners with a %i px border on a 4K image', async (width) => {
    const bytes = await readFile('tests/fixtures/generated/ui-4k.png')
    const source = await loadImage(bytes)
    const kit = canvasKit as typeof canvasKit & {
      MakeImageFromEncoded(bytes: Uint8Array): CanvasKitImage | null
    }
    const decoded = kit.MakeImageFromEncoded(bytes)
    if (!decoded) throw new Error('CanvasKit failed to decode the 4K fixture')
    const typefaces = new CanvasKitTypefaceStore(canvasKit, [])
    const base = documentFixture.layers[0] as ImageLayer
    const preview = createCanvas(2560, 1440)
    const renderer = new Canvas2DRenderer({
      exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike,
    })
    await renderer.initialize({
      scene: preview as unknown as HTMLCanvasElement,
      overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement,
      dpr: 1,
      correlationId: 'image-border-corners',
    })
    try {
      await renderer.createImageResource({
        id: base.payload.blobHash,
        width: 3840,
        height: 2160,
        source: source as unknown as HTMLImageElement,
      })
      for (const radius of [0, 80]) {
        const image: ImageLayer = {
          ...base,
          locked: false,
          localBounds: { x: 0, y: 0, width: 3840, height: 2160 },
          transform: { translateX: 96, translateY: 96, rotation: 0, scaleX: 0.5, scaleY: 0.5 },
          payload: {
            ...base.payload,
            role: 'content',
            intrinsicWidth: 3840,
            intrinsicHeight: 2160,
            radius,
            border: {
              color: { red: 1, green: 0.4, blue: 0.3, alpha: 1 },
              width,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
          },
        }
        const scene = createDocumentRenderScene({
          ...documentFixture,
          canvas: { width: 2560, height: 1440 },
          layers: [image],
        })
        renderer.setScene(scene)
        renderer.render(['scene'])
        const exported = await renderer.exportPng()
        const pixels = await rgba(exported)
        expect(compareRgba(pixels, await rgba(await preview.encode('png')))).toEqual({
          changedChannels: 0,
          maximumDelta: 0,
        })
        const skia = renderCanvasKitPng(canvasKit, scene, new Map([[
          image.payload.blobHash,
          {
            id: image.payload.blobHash,
            width: 3840,
            height: 2160,
            source: source as unknown as HTMLImageElement,
            image: decoded,
            dispose: () => decoded.delete(),
          },
        ]]), typefaces)
        for (const result of [pixels, await rgba(skia)]) {
          for (const x of [Math.floor(96 - width / 4 + 1), Math.floor(2016 + width / 4 - 2)]) {
            for (const y of [Math.floor(96 - width / 4 + 1), Math.floor(1176 + width / 4 - 2)]) {
              const corner = [...result.slice((y * 2560 + x) * 4, (y * 2560 + x) * 4 + 4)]
              expect(corner).toEqual(radius === 0 ? [255, 102, 77, 255] : [0, 0, 0, 0])
            }
          }
          expect(result[(96 * 2560 + 1000) * 4 + 3]).toBe(255)
        }
        await mkdir('artifacts/image-square', { recursive: true })
        await writeFile(`artifacts/image-square/canvas2d-${width}-${radius}.png`, exported)
        await writeFile(`artifacts/image-square/canvaskit-${width}-${radius}.png`, skia)
      }
    } finally {
      typefaces.dispose()
      decoded.delete()
      renderer.dispose()
    }
  }, 30000)
})
