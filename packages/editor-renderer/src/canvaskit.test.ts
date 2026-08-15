import { createCanvas, loadImage } from '@napi-rs/canvas'
import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import CanvasKitInit from 'canvaskit-wasm'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  CanvasKitRenderer,
  renderHeadlessCanvasKitPng,
  resolveCanvasKitVisualCenterBaseline,
  type CanvasKitApi,
  type CanvasKitFontData,
} from './canvaskit'

async function robotoFontData(
  subset: CanvasKitFontData['subset'],
): Promise<CanvasKitFontData> {
  const bytes = await readFile(
    path.resolve(
      process.cwd(),
      `packages/editor-vue/node_modules/@fontsource/roboto/files/roboto-${subset}-400-normal.woff2`,
    ),
  )
  return {
    family: 'Roboto',
    subset,
    data: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  }
}

describe('CanvasKit renderer', () => {
  it('resizes a live full-crop-full surface without losing image or font resources', async () => {
    const deletedContexts: number[] = []
    const typefaceDelete = vi.fn()
    const surfaces: {
      readonly kind: 'webgl' | 'working'
      readonly width: number
      readonly height: number
      readonly textureUploads: ReturnType<typeof vi.fn>
      readonly dispose: ReturnType<typeof vi.fn>
      readonly drawImageRect: ReturnType<typeof vi.fn>
    }[] = []
    let nextContext = 1
    const makeSurface = (
      kind: 'webgl' | 'working',
      width: number,
      height: number,
    ) => {
      const drawImageRect = vi.fn()
      const canvas = {
        clear: vi.fn(),
        save: vi.fn(() => 1),
        restore: vi.fn(),
        rotate: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        drawRect: vi.fn(),
        drawOval: vi.fn(),
        drawLine: vi.fn(),
        drawPath: vi.fn(),
        drawImageRect,
      }
      const textureUploads = vi.fn(() => ({
        delete: vi.fn(),
        encodeToBytes: vi.fn(() => new Uint8Array([1])),
      }))
      const entry = {
        kind,
        width,
        height,
        textureUploads,
        dispose: vi.fn(),
        drawImageRect,
      }
      surfaces.push(entry)
      return {
        ...(kind === 'webgl' ? { Gd: nextContext++ } : {}),
        getCanvas: () => canvas,
        flush: vi.fn(),
        makeImageSnapshot: () => ({
          delete: vi.fn(),
          encodeToBytes: vi.fn(() => new Uint8Array([1])),
        }),
        makeImageFromTextureSource: textureUploads,
        dispose: entry.dispose,
      }
    }
    class Paint {
      delete = vi.fn()
      setAntiAlias = vi.fn()
      setColorComponents = vi.fn()
      setStyle = vi.fn()
      setStrokeWidth = vi.fn()
      setStrokeCap = vi.fn()
      setStrokeJoin = vi.fn()
      setBlendMode = vi.fn()
      setShader = vi.fn()
      setPathEffect = vi.fn()
    }
    const canvasKit = {
      Paint,
      PaintStyle: { Fill: 'fill', Stroke: 'stroke' },
      BlendMode: {
        SrcOver: 'source-over',
        Multiply: 'multiply',
        Screen: 'screen',
        Overlay: 'overlay',
        Darken: 'darken',
        Lighten: 'lighten',
        SoftLight: 'soft-light',
        HardLight: 'hard-light',
      },
      StrokeCap: { Butt: 'butt', Round: 'round', Square: 'square' },
      StrokeJoin: { Miter: 'miter', Round: 'round', Bevel: 'bevel' },
      TileMode: { Clamp: 'clamp' },
      Shader: {},
      PathEffect: {},
      ImageFormat: { PNG: 'png' },
      TRANSPARENT: 'transparent',
      Typeface: {
        MakeFreeTypeFaceFromData: () => ({ delete: typefaceDelete }),
      },
      XYWHRect: (x: number, y: number, width: number, height: number) =>
        new Float32Array([x, y, width, height]),
      RRectXY: (rect: Float32Array) => rect,
      LTRBRect: (left: number, top: number, right: number, bottom: number) =>
        new Float32Array([left, top, right, bottom]),
      MakeSurface: (width: number, height: number) =>
        makeSurface('working', width, height),
      MakeWebGLCanvasSurface: (canvas: HTMLCanvasElement) =>
        makeSurface('webgl', canvas.width, canvas.height),
      deleteContext: (handle: number) => deletedContexts.push(handle),
    } as unknown as CanvasKitApi
    const sceneCanvas = {
      width: 1,
      height: 1,
      style: { width: '', height: '' },
      isConnected: true,
    } as unknown as HTMLCanvasElement
    const overlayContext = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
    }
    const overlayCanvas = {
      width: 1,
      height: 1,
      style: { width: '', height: '' },
      getContext: vi.fn(() => overlayContext),
    } as unknown as HTMLCanvasElement
    const fullScene = createRenderSceneSnapshot({
      width: 120,
      height: 80,
      nodes: [
        {
          kind: 'image',
          id: 'image',
          resourceId: 'image-resource',
          x: 0,
          y: 0,
          width: 120,
          height: 80,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          opacity: 1,
          visible: true,
        },
      ],
    })
    const croppedScene = createRenderSceneSnapshot({
      ...fullScene,
      nodes: fullScene.nodes,
      outputBounds: { x: 20, y: 10, width: 60, height: 40 },
    })
    const renderer = new CanvasKitRenderer(canvasKit, () => 0, [
      { family: 'Roboto', subset: 'latin', data: new ArrayBuffer(1) },
    ])
    renderer.setScene(fullScene)
    await renderer.initialize({
      scene: sceneCanvas,
      overlay: overlayCanvas,
      dpr: 1,
      correlationId: 'live-resize',
    })
    const resource = await renderer.createImageResource({
      id: 'image-resource',
      width: 120,
      height: 80,
      source: {} as HTMLImageElement,
    })
    renderer.render(['scene', 'overlay'])

    expect([sceneCanvas.width, sceneCanvas.height]).toEqual([120, 80])
    expect([sceneCanvas.style.width, sceneCanvas.style.height]).toEqual([
      '120px',
      '80px',
    ])

    renderer.setScene(croppedScene)
    renderer.render(['scene', 'overlay'])
    expect([sceneCanvas.width, sceneCanvas.height]).toEqual([60, 40])
    expect([overlayCanvas.width, overlayCanvas.height]).toEqual([60, 40])
    expect([sceneCanvas.style.width, sceneCanvas.style.height]).toEqual([
      '60px',
      '40px',
    ])
    expect(surfaces.filter((surface) => surface.kind === 'webgl')).toHaveLength(
      2,
    )
    expect(
      surfaces.filter((surface) => surface.kind === 'webgl')[1]?.drawImageRect,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      new Float32Array([0, 0, 60, 40]),
      expect.anything(),
      false,
    )

    renderer.setScene(fullScene)
    renderer.render(['scene', 'overlay'])
    expect([sceneCanvas.width, sceneCanvas.height]).toEqual([120, 80])
    const webglSurfaces = surfaces.filter((surface) => surface.kind === 'webgl')
    expect(webglSurfaces).toHaveLength(3)
    expect(
      webglSurfaces.map((surface) => surface.textureUploads.mock.calls.length),
    ).toEqual([1, 1, 1])
    expect(
      webglSurfaces
        .slice(0, 2)
        .every((surface) => surface.dispose.mock.calls.length === 1),
    ).toBe(true)
    expect(deletedContexts).toEqual([1, 2])
    expect(typefaceDelete).not.toHaveBeenCalled()

    resource.dispose()
    renderer.dispose()
    expect(webglSurfaces[2]?.dispose).toHaveBeenCalledTimes(1)
    expect(deletedContexts).toEqual([1, 2, 3])
    expect(typefaceDelete).toHaveBeenCalledTimes(1)
  })

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

  it('continues an arrow dash phase through an elbow corner', async () => {
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
        width: 40,
        height: 40,
        nodes: [
          {
            kind: 'path',
            id: 'arrow:body',
            points: [
              { x: 8, y: 8 },
              { x: 16, y: 8 },
              { x: 16, y: 32 },
            ],
            rotation: 0,
            opacity: 1,
            visible: true,
            stroke: { red: 1, green: 0, blue: 0, alpha: 1 },
            strokeWidth: 2,
            lineCap: 'butt',
            lineJoin: 'round',
            dash: [8, 4],
          },
        ],
      }),
    )
    const decoded = await loadImage(png)
    const canvas = createCanvas(decoded.width, decoded.height)
    const context = canvas.getContext('2d')
    context.drawImage(decoded, 0, 0)

    expect(context.getImageData(16, 10, 1, 1).data[3]).toBe(0)
    expect(context.getImageData(16, 14, 1, 1).data[3]).toBeGreaterThan(0)
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

  it('computes a visual-center baseline from CanvasKit glyph bounds', () => {
    const baseline = resolveCanvasKitVisualCenterBaseline(
      {
        getGlyphIDs: () => new Uint16Array([1]),
        getGlyphBounds: () => new Float32Array([0, -20, 9, 1]),
      },
      '1',
      8,
      48,
      40,
      32,
    )

    expect(baseline).toBe(41.5)
  })

  it('renders mixed rich-text runs, bullet metadata and strikethrough headlessly', async () => {
    const canvasKit = (await CanvasKitInit({
      locateFile: () =>
        path.resolve(
          process.cwd(),
          'packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
        ),
    })) as import('./canvaskit').CanvasKitApi
    const fontData = await Promise.all([
      robotoFontData('latin'),
      robotoFontData('cyrillic'),
    ])
    const png = renderHeadlessCanvasKitPng(
      canvasKit,
      createRenderSceneSnapshot({
        width: 160,
        height: 80,
        nodes: [
          {
            kind: 'text',
            id: 'rich-text',
            text: 'A справа',
            x: 10,
            y: 10,
            width: 120,
            height: 48,
            wrap: 'fixedWidth',
            fixedWidth: 120,
            runs: [
              {
                start: 0,
                end: 1,
                fontFamily: 'Roboto',
                fontSize: 32,
                color: { red: 0, green: 0, blue: 1, alpha: 1 },
                fontWeight: 400,
                fontStyle: 'normal',
                strikethrough: false,
              },
              {
                start: 1,
                end: 8,
                fontFamily: 'Roboto',
                fontSize: 24,
                color: { red: 1, green: 0, blue: 0, alpha: 1 },
                fontWeight: 700,
                fontStyle: 'italic',
                strikethrough: true,
              },
            ],
            paragraphs: [
              { start: 0, end: 8, alignment: 'start', listKind: 'bullet' },
            ],
            rotation: 0,
            opacity: 1,
            visible: true,
          },
        ],
      }),
      fontData,
    )
    const image = await loadImage(png)
    const canvas = createCanvas(image.width, image.height)
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, image.width, image.height).data
    expect(
      pixels.some(
        (value, index) =>
          index % 4 === 2 &&
          value > (pixels[index - 2] ?? 0) &&
          (pixels[index + 1] ?? 0) > 0,
      ),
    ).toBe(true)
    expect(
      pixels.some(
        (value, index) =>
          index % 4 === 0 &&
          value > (pixels[index + 2] ?? 0) &&
          (pixels[index + 3] ?? 0) > 0,
      ),
    ).toBe(true)
  })

  it('rejects Cyrillic text when no supplied typeface covers its glyphs', async () => {
    const canvasKit = (await CanvasKitInit({
      locateFile: () =>
        path.resolve(
          process.cwd(),
          'packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
        ),
    })) as import('./canvaskit').CanvasKitApi
    const latin = await robotoFontData('latin')
    const snapshot = createRenderSceneSnapshot({
      width: 160,
      height: 48,
      nodes: [
        {
          kind: 'text',
          id: 'cyrillic-coverage',
          text: 'справа',
          x: 4,
          y: 4,
          width: 152,
          height: 40,
          wrap: 'autoSize',
          runs: [
            {
              start: 0,
              end: 6,
              fontFamily: 'Roboto',
              fontSize: 24,
              color: { red: 1, green: 1, blue: 1, alpha: 1 },
              fontWeight: 400,
              fontStyle: 'normal',
              strikethrough: false,
            },
          ],
          paragraphs: [
            { start: 0, end: 6, alignment: 'start', listKind: 'none' },
          ],
          rotation: 0,
          opacity: 1,
          visible: true,
        },
      ],
    })

    expect(() =>
      renderHeadlessCanvasKitPng(canvasKit, snapshot, [latin]),
    ).toThrow(/glyph coverage.*справа/u)
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
