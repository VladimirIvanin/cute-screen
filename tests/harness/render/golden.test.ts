import { createCanvas, loadImage } from '@napi-rs/canvas'
import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import {
  Canvas2DRenderer,
  renderHeadlessCanvasKitPng,
  type Canvas2DLike,
  type CanvasKitApi,
} from '@cute-screen/editor-renderer'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import { compareRgba, semanticParityTolerance } from './golden'

const goldenRoot = path.resolve('tests/goldens/m01-renderer')
let canvasKit: CanvasKitApi
const require = createRequire(import.meta.url)
const CanvasKitInit =
  require('../../../packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.js') as (options: {
    locateFile: () => string
  }) => Promise<CanvasKitApi>

beforeAll(async () => {
  canvasKit = (await CanvasKitInit({
    locateFile: () =>
      path.resolve(
        'packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
      ),
  })) as CanvasKitApi
})

function scene(dpr: 1 | 2) {
  const scale = (value: number) => value * dpr
  return createRenderSceneSnapshot({
    width: scale(96),
    height: scale(64),
    nodes: [
      {
        kind: 'rect',
        id: 'rect',
        x: scale(8),
        y: scale(7),
        width: scale(38),
        height: scale(25),
        rotation: 8,
        opacity: 0.82,
        visible: true,
        fill: { red: 0.94, green: 0.3, blue: 0.2, alpha: 1 },
        stroke: { red: 0.2, green: 0.08, blue: 0.04, alpha: 1 },
        strokeWidth: scale(2),
      },
      {
        kind: 'ellipse',
        id: 'ellipse',
        centerX: scale(66),
        centerY: scale(26),
        radiusX: scale(17),
        radiusY: scale(11),
        rotation: -12,
        opacity: 1,
        visible: true,
        fill: { red: 0.12, green: 0.56, blue: 0.88, alpha: 0.9 },
      },
      {
        kind: 'line',
        id: 'line',
        x1: scale(14),
        y1: scale(51),
        x2: scale(83),
        y2: scale(45),
        rotation: 0,
        opacity: 1,
        visible: true,
        stroke: { red: 0.16, green: 0.72, blue: 0.42, alpha: 1 },
        strokeWidth: scale(3),
      },
    ],
  })
}

async function canvas2dPng(dpr: 1 | 2): Promise<Uint8Array> {
  const snapshot = scene(dpr)
  const renderer = new Canvas2DRenderer({
    exportCanvas: (width, height) =>
      createCanvas(width, height) as unknown as Canvas2DLike,
  })
  await renderer.initialize({
    scene: createCanvas(
      snapshot.width,
      snapshot.height,
    ) as unknown as HTMLCanvasElement,
    overlay: createCanvas(
      snapshot.width,
      snapshot.height,
    ) as unknown as HTMLCanvasElement,
    dpr,
    correlationId: `golden-canvas2d-dpr-${dpr}`,
  })
  renderer.setScene(snapshot)
  const png = await renderer.exportPng()
  renderer.dispose()
  return png
}

async function rgba(png: Uint8Array): Promise<Uint8Array> {
  const image = await loadImage(png)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return new Uint8Array(
    context.getImageData(0, 0, image.width, image.height).data,
  )
}

async function assertGolden(name: string, actual: Uint8Array): Promise<void> {
  const file = path.join(goldenRoot, `${name}.png`)
  if (process.env.CUTE_SCREEN_UPDATE_GOLDENS === '1') {
    await mkdir(goldenRoot, { recursive: true })
    await writeFile(file, actual)
  }
  const expected = new Uint8Array(await readFile(file))
  expect(compareRgba(await rgba(actual), await rgba(expected))).toEqual({
    changedChannels: 0,
    maximumDelta: 0,
  })
}

describe('renderer golden harness self-test', () => {
  it('reports channel changes on a synthetic RGBA pixel', () => {
    const expected = Uint8Array.from([255, 0, 0, 255])
    const actual = Uint8Array.from([250, 0, 2, 255])

    expect(compareRgba(actual, expected)).toEqual({
      changedChannels: 2,
      maximumDelta: 5,
    })
  })

  for (const dpr of [1, 2] as const) {
    it(`matches CanvasKit and Canvas2D goldens at DPR ${dpr}`, async () => {
      const canvasKitPng = renderHeadlessCanvasKitPng(canvasKit, scene(dpr))
      const fallbackPng = await canvas2dPng(dpr)
      await assertGolden(`canvaskit-dpr-${dpr}`, canvasKitPng)
      await assertGolden(`canvas2d-dpr-${dpr}`, fallbackPng)

      const difference = compareRgba(
        await rgba(canvasKitPng),
        await rgba(fallbackPng),
      )
      expect(
        difference.changedChannels / (scene(dpr).width * scene(dpr).height * 4),
      ).toBeLessThanOrEqual(semanticParityTolerance.maximumChangedChannelRatio)
      expect(difference.maximumDelta).toBeLessThanOrEqual(
        semanticParityTolerance.maximumDelta,
      )
    })
  }

  it('rejects the deterministic corrupted PNG fixture', async () => {
    await expect(
      loadImage(path.resolve('tests/fixtures/generated/corrupted.png')),
    ).rejects.toThrow()
  })
})
