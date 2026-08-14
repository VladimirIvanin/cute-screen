import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas'
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
  type CanvasKitFontData,
} from '@cute-screen/editor-renderer'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import { compareRgba, semanticParityTolerance } from './golden'

const goldenRoot = path.resolve('tests/goldens/m01-renderer')
let canvasKit: CanvasKitApi
let canvasKitFonts: readonly CanvasKitFontData[] = []
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
  const loadFont = async (
    subset: CanvasKitFontData['subset'],
  ): Promise<CanvasKitFontData> => {
    const bytes = await readFile(
      path.resolve(
        `packages/editor-vue/node_modules/@fontsource/roboto/files/roboto-${subset}-400-normal.woff2`,
      ),
    )
    if (!GlobalFonts.register(bytes, `Roboto ${subset}`)) {
      throw new Error(`Canvas2D could not register bundled Roboto ${subset}`)
    }
    return {
      family: 'Roboto',
      subset,
      data: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    }
  }
  canvasKitFonts = await Promise.all([loadFont('latin'), loadFont('cyrillic')])
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
    resolveFontFamily: (text) =>
      /[\u0400-\u052f]/u.test(text) ? 'Roboto cyrillic' : 'Roboto latin',
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
    schemaVersion: 7,
    id: '019c1f62-058e-7000-8000-000000000600',
    source: {
      blobHash: 'a'.repeat(64),
      format: 'png',
      mimeType: 'image/png',
      width: 360,
      height: 390,
      orientationApplied: true,
      provenance: 'capture',
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
    schemaVersion: 7,
    id: '019c1f62-058e-7000-8000-000000000614',
    source: {
      blobHash: 'b'.repeat(64),
      format: 'png',
      mimeType: 'image/png',
      width: 360,
      height: 140,
      orientationApplied: true,
      provenance: 'capture',
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

function persistedRichTextScene(): RenderSceneSnapshot {
  const document: EditorDocumentV1 = {
    schemaVersion: 7,
    id: '019c1f62-058e-7000-8000-000000000700',
    source: {
      blobHash: 'c'.repeat(64),
      format: 'png',
      mimeType: 'image/png',
      width: 360,
      height: 220,
      orientationApplied: true,
      provenance: 'capture',
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas: { width: 360, height: 220 },
    crop: null,
    layers: [
      {
        id: '019c1f62-058e-7000-8000-000000000701',
        kind: 'text',
        localBounds: { x: 0, y: 0, width: 140, height: 92 },
        transform: {
          translateX: 20,
          translateY: 20,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        visible: true,
        locked: false,
        payload: {
          content: {
            text: 'Mix 😀 red wrapping words',
            wrap: 'fixedWidth',
            fixedWidth: 140,
            spans: [
              {
                start: 0,
                end: 6,
                fontFamily: 'Roboto',
                fontSize: 18,
                color: { red: 0.08, green: 0.16, blue: 0.3, alpha: 1 },
                weight: 400,
                italic: false,
                strikethrough: false,
              },
              {
                start: 6,
                end: 25,
                fontFamily: 'Roboto',
                fontSize: 26,
                color: { red: 0.88, green: 0.12, blue: 0.18, alpha: 1 },
                weight: 700,
                italic: true,
                strikethrough: true,
              },
            ],
            paragraphs: [
              { start: 0, end: 25, alignment: 'center', listKind: 'bullet' },
            ],
          },
          background: {
            color: { red: 1, green: 0.87, blue: 0.42, alpha: 1 },
            padding: 6,
            radius: 10,
          },
        },
      },
      {
        id: '019c1f62-058e-7000-8000-000000000702',
        kind: 'callout',
        localBounds: { x: 0, y: 0, width: 150, height: 80 },
        transform: {
          translateX: 190,
          translateY: 24,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        visible: true,
        locked: false,
        payload: {
          content: {
            text: 'Callout\nсправа',
            wrap: 'fixedWidth',
            fixedWidth: 134,
            spans: [
              {
                start: 0,
                end: 8,
                fontFamily: 'Roboto',
                fontSize: 20,
                color: { red: 1, green: 1, blue: 1, alpha: 1 },
                weight: 700,
                italic: false,
                strikethrough: false,
              },
              {
                start: 8,
                end: 14,
                fontFamily: 'Roboto',
                fontSize: 16,
                color: { red: 0.72, green: 0.9, blue: 1, alpha: 1 },
                weight: 400,
                italic: true,
                strikethrough: false,
              },
            ],
            paragraphs: [
              { start: 0, end: 8, alignment: 'start', listKind: 'none' },
              { start: 8, end: 14, alignment: 'end', listKind: 'bullet' },
            ],
          },
          bubble: {
            color: { red: 0.08, green: 0.34, blue: 0.66, alpha: 1 },
            padding: 8,
            radius: 12,
          },
          tailAnchor: { x: 125, y: 112 },
        },
      },
      {
        id: '019c1f62-058e-7000-8000-000000000703',
        kind: 'numberedMarker',
        localBounds: { x: 0, y: 0, width: 52, height: 52 },
        transform: {
          translateX: 154,
          translateY: 150,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        visible: true,
        locked: false,
        payload: {
          sequence: 7,
          label: {
            text: '7',
            wrap: 'autoSize',
            spans: [
              {
                start: 0,
                end: 1,
                fontFamily: 'Roboto',
                fontSize: 28,
                color: { red: 1, green: 1, blue: 1, alpha: 1 },
                weight: 700,
                italic: false,
                strikethrough: true,
              },
            ],
            paragraphs: [
              { start: 0, end: 1, alignment: 'center', listKind: 'none' },
            ],
          },
          badge: {
            shape: 'circle',
            color: { red: 0.72, green: 0.16, blue: 0.42, alpha: 1 },
          },
        },
      },
    ],
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  }
  const parsed = parseEditorDocument(serializeEditorDocument(document))
  if (parsed.kind !== 'editable')
    throw new Error('rich-text golden must be editable')
  return createDocumentRenderScene(parsed.document)
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

  it('matches v7 rich-text layout goldens across Text, Callout and Numbered Marker', async () => {
    const snapshot = persistedRichTextScene()
    const canvasKitPng = renderHeadlessCanvasKitPng(
      canvasKit,
      snapshot,
      canvasKitFonts,
    )
    const fallback = await canvas2dPngs(snapshot, 1)

    await assertGolden('rich-text-v7-canvaskit', canvasKitPng)
    await assertGolden('rich-text-v7-canvas2d', fallback.exported)
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
