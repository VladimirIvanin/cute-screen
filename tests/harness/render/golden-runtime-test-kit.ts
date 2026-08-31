import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
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
  type Canvas2DLike,
  type CanvasKitApi,
  type CanvasKitFontData,
} from '@cute-screen/editor-renderer'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export async function prepareGoldenRuntime(): Promise<void> {
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
}

export const goldenRoot = path.resolve('tests/goldens/m01-renderer')

export let canvasKit: CanvasKitApi

export let canvasKitFonts: readonly CanvasKitFontData[] = []

export const require = createRequire(import.meta.url)

export const CanvasKitInit =
  require('../../../packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.js') as (options: {
    locateFile: () => string
  }) => Promise<CanvasKitApi>

export function scene(dpr: 1 | 2) {
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

export async function canvas2dPngs(
  snapshot: RenderSceneSnapshot,
  dpr: 1 | 2,
  exportScale = 1,
): Promise<Readonly<{ preview: Uint8Array; exported: Uint8Array }>> {
  const sceneCanvas = createCanvas(
    snapshot.outputBounds.width,
    snapshot.outputBounds.height,
  )
  const renderer = new Canvas2DRenderer({
    exportCanvas: (width, height) =>
      createCanvas(width, height) as unknown as Canvas2DLike,
    resolveFontFamily: (text) =>
      /[\u0400-\u052f]/u.test(text) ? 'Roboto cyrillic' : 'Roboto latin',
  })
  await renderer.initialize({
    scene: sceneCanvas as unknown as HTMLCanvasElement,
    overlay: createCanvas(
      snapshot.outputBounds.width,
      snapshot.outputBounds.height,
    ) as unknown as HTMLCanvasElement,
    dpr,
    correlationId: `golden-canvas2d-dpr-${dpr}`,
  })
  renderer.setScene(snapshot)
  renderer.render(['scene'])
  const preview = await sceneCanvas.encode('png')
  const exported = await renderer.exportPng({ scale: exportScale })
  renderer.dispose()
  return { preview, exported }
}

export function precisionScene(): RenderSceneSnapshot {
  const nodes: RenderSceneSnapshot['nodes'][number][] = [
    {
      kind: 'rect',
      id: 'precision-background',
      x: 0,
      y: 0,
      width: 240,
      height: 160,
      rotation: 0,
      opacity: 1,
      visible: true,
      fill: { red: 0.94, green: 0.95, blue: 0.98, alpha: 1 },
    },
  ]
  for (let index = 0; index < 24; index += 1) {
    nodes.push({
      kind: 'rect',
      id: `precision-stripe-${index}`,
      x: index * 10,
      y: 8,
      width: 10,
      height: 54,
      rotation: 0,
      opacity: 1,
      visible: true,
      fill:
        index % 2 === 0
          ? { red: 0.94, green: 0.24, blue: 0.18, alpha: 1 }
          : { red: 0.1, green: 0.42, blue: 0.92, alpha: 1 },
    })
  }
  nodes.push(
    {
      kind: 'censor',
      id: 'precision-pixelate',
      region: { kind: 'rectangle', x: 16, y: 16, width: 56, height: 36 },
      effect: { mode: 'pixelate', blockSize: 12 },
      sampleSource: 'compositeBelow',
      rotation: 0,
      opacity: 1,
      visible: true,
    },
    {
      kind: 'censor',
      id: 'precision-blur',
      region: { kind: 'rectangle', x: 88, y: 16, width: 56, height: 36 },
      effect: { mode: 'blur', strength: 7 },
      sampleSource: 'compositeBelow',
      rotation: 0,
      opacity: 1,
      visible: true,
    },
    {
      kind: 'censor',
      id: 'precision-solid',
      region: { kind: 'rectangle', x: 160, y: 16, width: 56, height: 36 },
      effect: {
        mode: 'solid',
        color: { red: 0.1, green: 0.12, blue: 0.18, alpha: 1 },
      },
      sampleSource: 'compositeBelow',
      rotation: 0,
      opacity: 1,
      visible: true,
    },
    {
      kind: 'spotlight',
      id: 'precision-spotlight',
      aperture: {
        shape: 'ellipse',
        x: 18,
        y: 78,
        width: 76,
        height: 54,
      },
      dimColor: { red: 0.02, green: 0.04, blue: 0.08, alpha: 1 },
      dimOpacity: 0.28,
      feather: 'soft',
      rotation: 0,
      opacity: 1,
      visible: true,
    },
    {
      kind: 'loupe',
      id: 'precision-loupe',
      sourceRegion: { x: 16, y: 16, width: 32, height: 32 },
      lens: { shape: 'circle', x: 124, y: 78, size: 64 },
      zoom: 2,
      border: {
        color: { red: 1, green: 0.78, blue: 0.18, alpha: 1 },
        width: 4,
      },
      shadow: {
        color: { red: 0, green: 0, blue: 0, alpha: 0.45 },
        offsetX: 3,
        offsetY: 5,
        blur: 8,
      },
      sampleSource: 'compositeBelow',
      rotation: 0,
      opacity: 1,
      visible: true,
    },
    {
      kind: 'ruler',
      id: 'precision-ruler-horizontal',
      x1: 112,
      y1: 70,
      x2: 214,
      y2: 70,
      length: 102,
      angleDegrees: 0,
      percent: 35.363,
      percentBasis: 'canvasDiagonal',
      unit: 'pixels',
      label: '102 px',
      color: { red: 227 / 255, green: 72 / 255, blue: 143 / 255, alpha: 1 },
      thickness: 2,
      fontSize: 14,
      rotation: 0,
      opacity: 1,
      visible: true,
    },
    {
      kind: 'ruler',
      id: 'precision-ruler',
      x1: 56,
      y1: 146,
      x2: 144,
      y2: 106,
      length: 96.664_367,
      angleDegrees: -24.443_955,
      percent: 33.515,
      percentBasis: 'canvasDiagonal',
      unit: 'pixels',
      label: '97 px',
      color: { red: 227 / 255, green: 72 / 255, blue: 143 / 255, alpha: 1 },
      thickness: 3,
      fontSize: 16,
      rotation: 0,
      opacity: 1,
      visible: true,
    },
    {
      kind: 'rect',
      id: 'precision-higher-layer',
      x: 42,
      y: 26,
      width: 10,
      height: 10,
      rotation: 0,
      opacity: 1,
      visible: true,
      fill: { red: 0.1, green: 0.82, blue: 0.3, alpha: 1 },
    },
  )
  return createRenderSceneSnapshot({
    width: 240,
    height: 160,
    outputBounds: { x: 24, y: 8, width: 208, height: 144 },
    nodes,
  })
}

export const arrowCaps = [
  'none',
  'lineArrow',
  'solidArrow',
  'triangle',
  'circle',
  'diamond',
] as const satisfies readonly ArrowCap[]

export function persistedArrowScene(
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
