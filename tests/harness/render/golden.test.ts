import { createCanvas, loadImage } from '@napi-rs/canvas'
import {
  createDocumentRenderScene,
  createRenderSceneSnapshot,
  parseEditorDocument,
  serializeEditorDocument,
  type ArrowCap,
  type ArrowLayer,
  type EditorDocumentV1,
  type RenderSceneSnapshot,
} from '@cute-screen/editor-core'
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

async function canvas2dPngs(
  snapshot: RenderSceneSnapshot,
  dpr: 1 | 2,
): Promise<Readonly<{ preview: Uint8Array; exported: Uint8Array }>> {
  const sceneCanvas = createCanvas(snapshot.width, snapshot.height)
  const renderer = new Canvas2DRenderer({
    exportCanvas: (width, height) =>
      createCanvas(width, height) as unknown as Canvas2DLike,
  })
  await renderer.initialize({
    scene: sceneCanvas as unknown as HTMLCanvasElement,
    overlay: createCanvas(
      snapshot.width,
      snapshot.height,
    ) as unknown as HTMLCanvasElement,
    dpr,
    correlationId: `golden-canvas2d-dpr-${dpr}`,
  })
  renderer.setScene(snapshot)
  renderer.render(['scene'])
  const preview = await sceneCanvas.encode('png')
  const exported = await renderer.exportPng()
  renderer.dispose()
  return { preview, exported }
}

const arrowCaps = [
  'none',
  'lineArrow',
  'solidArrow',
  'triangle',
  'circle',
  'diamond',
] as const satisfies readonly ArrowCap[]

function persistedArrowScene(
  route: 'straight' | 'quadratic' | 'elbow',
): RenderSceneSnapshot {
  const layers: ArrowLayer[] = []
  for (const [styleIndex, style] of ['solid', 'dashed'].entries()) {
    for (const [capIndex, cap] of arrowCaps.entries()) {
      const row = styleIndex * arrowCaps.length + capIndex
      const y = 24 + row * 30
      const start = { x: 24, y }
      const end = { x: 312, y: route === 'elbow' ? y + 12 : y }
      layers.push({
        id: `019c1f62-058e-7000-8000-${(row + 1).toString().padStart(12, '0')}`,
        kind: 'arrow',
        localBounds: { x: 0, y: 0, width: 336, height: 390 },
        transform: {
          translateX: 0,
          translateY: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        opacity: 1,
        visible: true,
        locked: false,
        blendMode: 'normal',
        shadows: [],
        payload: {
          path: route,
          start,
          end,
          ...(route === 'quadratic' ? { bend: { x: 168, y: y - 12 } } : {}),
          ...(route === 'elbow'
            ? {
                elbow: { axis: 'y' as const, offset: row % 2 === 0 ? -18 : 18 },
              }
            : {}),
          stroke: {
            color: { red: 0.12, green: 0.45, blue: 0.88, alpha: 1 },
            width: 3,
            style: style as 'solid' | 'dashed',
            cap: 'round',
            join: 'round',
          },
          startCap: cap,
          endCap: cap,
        },
      })
    }
  }
  const document: EditorDocumentV1 = {
    schemaVersion: 6,
    id: '019c1f62-058e-7000-8000-000000000600',
    source: {
      blobHash: 'a'.repeat(64),
      format: 'png',
      mimeType: 'image/png',
      width: 360,
      height: 390,
      orientationApplied: true,
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas: { width: 360, height: 390 },
    crop: null,
    layers,
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  }
  const parsed = parseEditorDocument(serializeEditorDocument(document))
  if (parsed.kind !== 'editable')
    throw new Error('arrow golden must be editable')
  return createDocumentRenderScene(parsed.document)
}

function curvedStartCapRepairScene(): RenderSceneSnapshot {
  const arrow: ArrowLayer = {
    id: '019c1f62-058e-7000-8000-000000000613',
    kind: 'arrow',
    localBounds: { x: 0, y: 0, width: 360, height: 140 },
    transform: {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal',
    shadows: [],
    payload: {
      path: 'quadratic',
      start: { x: 32, y: 28 },
      end: { x: 328, y: 110 },
      bend: { x: 76, y: 102 },
      stroke: {
        color: { red: 1, green: 0.78, blue: 0.23, alpha: 1 },
        width: 6,
        style: 'solid',
        cap: 'round',
        join: 'round',
      },
      startCap: 'solidArrow',
      endCap: 'solidArrow',
    },
  }
  const document: EditorDocumentV1 = {
    schemaVersion: 6,
    id: '019c1f62-058e-7000-8000-000000000614',
    source: {
      blobHash: 'b'.repeat(64),
      format: 'png',
      mimeType: 'image/png',
      width: 360,
      height: 140,
      orientationApplied: true,
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas: { width: 360, height: 140 },
    crop: null,
    layers: [arrow],
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  }
  const parsed = parseEditorDocument(serializeEditorDocument(document))
  if (parsed.kind !== 'editable')
    throw new Error('curved start-cap repair golden must be editable')
  const arrowScene = createDocumentRenderScene(parsed.document)
  return createRenderSceneSnapshot({
    width: arrowScene.width,
    height: arrowScene.height,
    nodes: [
      {
        kind: 'rect',
        id: 'repair-background',
        x: 0,
        y: 0,
        width: arrowScene.width,
        height: arrowScene.height,
        rotation: 0,
        opacity: 1,
        visible: true,
        fill: { red: 0.055, green: 0.063, blue: 0.075, alpha: 1 },
      },
      ...arrowScene.nodes,
    ],
  })
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

function alphaBounds(
  pixels: Uint8Array,
  width: number,
  height: number,
): Readonly<{ left: number; top: number; right: number; bottom: number }> {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((pixels[(y * width + x) * 4 + 3] ?? 0) === 0) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < 0) throw new Error('expected non-transparent renderer output')
  return { left, top, right, bottom }
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
      const fallback = await canvas2dPngs(scene(dpr), dpr)
      await assertGolden(`canvaskit-dpr-${dpr}`, canvasKitPng)
      await assertGolden(`canvas2d-dpr-${dpr}`, fallback.exported)

      expect(
        compareRgba(
          await rgba(fallback.preview),
          await rgba(fallback.exported),
        ),
      ).toEqual({ changedChannels: 0, maximumDelta: 0 })

      const difference = compareRgba(
        await rgba(canvasKitPng),
        await rgba(fallback.exported),
      )
      expect(
        difference.changedChannels / (scene(dpr).width * scene(dpr).height * 4),
      ).toBeLessThanOrEqual(semanticParityTolerance.maximumChangedChannelRatio)
      expect(difference.maximumDelta).toBeLessThanOrEqual(
        semanticParityTolerance.maximumDelta,
      )
    })
  }

  for (const dpr of [1, 2] as const) {
    it(`keeps transformed missing-image bounds aligned at DPR ${dpr}`, async () => {
      const scale = (value: number) => value * dpr
      const snapshot = createRenderSceneSnapshot({
        width: scale(128),
        height: scale(96),
        nodes: [
          {
            kind: 'image',
            id: 'flipped-base',
            resourceId: 'missing-base',
            x: scale(112),
            y: scale(12),
            width: scale(64),
            height: scale(48),
            scaleX: 1,
            scaleY: -1,
            rotation: 180,
            opacity: 0.8,
            visible: true,
          },
        ],
      })
      const canvasKitPng = renderHeadlessCanvasKitPng(canvasKit, snapshot)
      const fallback = await canvas2dPngs(snapshot, dpr)
      const canvasKitBounds = alphaBounds(
        await rgba(canvasKitPng),
        snapshot.width,
        snapshot.height,
      )
      const canvas2dBounds = alphaBounds(
        await rgba(fallback.exported),
        snapshot.width,
        snapshot.height,
      )
      expect(
        Math.abs(canvasKitBounds.left - canvas2dBounds.left),
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(canvasKitBounds.top - canvas2dBounds.top),
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(canvasKitBounds.right - canvas2dBounds.right),
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(canvasKitBounds.bottom - canvas2dBounds.bottom),
      ).toBeLessThanOrEqual(1)
    })
  }

  for (const route of ['straight', 'quadratic', 'elbow'] as const) {
    it(`matches persisted ${route} arrow goldens for solid/dashed bodies and every endpoint`, async () => {
      const snapshot = persistedArrowScene(route)
      const canvasKitPng = renderHeadlessCanvasKitPng(canvasKit, snapshot)
      const fallback = await canvas2dPngs(snapshot, 1)

      await assertGolden(`arrow-${route}-canvaskit`, canvasKitPng)
      await assertGolden(`arrow-${route}-canvas2d`, fallback.exported)
      expect(
        compareRgba(
          await rgba(fallback.preview),
          await rgba(fallback.exported),
        ),
      ).toEqual({ changedChannels: 0, maximumDelta: 0 })

      const difference = compareRgba(
        await rgba(canvasKitPng),
        await rgba(fallback.exported),
      )
      expect(
        difference.changedChannels / (snapshot.width * snapshot.height * 4),
      ).toBeLessThanOrEqual(semanticParityTolerance.maximumChangedChannelRatio)
      expect(difference.maximumDelta).toBeLessThanOrEqual(
        semanticParityTolerance.maximumDelta,
      )
    })
  }

  it('matches the repaired curved left solid-cap golden', async () => {
    const snapshot = curvedStartCapRepairScene()
    const canvasKitPng = renderHeadlessCanvasKitPng(canvasKit, snapshot)
    const fallback = await canvas2dPngs(snapshot, 1)

    await assertGolden(
      'arrow-quadratic-start-cap-repair-canvaskit',
      canvasKitPng,
    )
    await assertGolden(
      'arrow-quadratic-start-cap-repair-canvas2d',
      fallback.exported,
    )
    expect(
      compareRgba(await rgba(fallback.preview), await rgba(fallback.exported)),
    ).toEqual({ changedChannels: 0, maximumDelta: 0 })

    const difference = compareRgba(
      await rgba(canvasKitPng),
      await rgba(fallback.exported),
    )
    expect(
      difference.changedChannels / (snapshot.width * snapshot.height * 4),
    ).toBeLessThanOrEqual(semanticParityTolerance.maximumChangedChannelRatio)
    expect(difference.maximumDelta).toBeLessThanOrEqual(
      semanticParityTolerance.maximumDelta,
    )
  })

  it('rejects the deterministic corrupted PNG fixture', async () => {
    await expect(
      loadImage(path.resolve('tests/fixtures/generated/corrupted.png')),
    ).rejects.toThrow()
  })
})
