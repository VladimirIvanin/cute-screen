import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import { describe, expect, it, vi } from 'vitest'

import { CanvasKitRenderer } from './backends/canvaskit/renderer'
import type { CanvasKitApi } from './backends/canvaskit/contracts'

describe('CanvasKit renderer lifecycle', () => {
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
})
