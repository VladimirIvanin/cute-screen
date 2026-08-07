import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import { describe, expect, it, vi } from 'vitest'

import { RendererRuntime } from './runtime'
import type { CanvasStack, Renderer } from './types'

function canvas(): HTMLCanvasElement {
  const target = new EventTarget() as HTMLCanvasElement
  Object.assign(target, { width: 64, height: 64 })
  return target
}

function renderer(backend: 'canvaskit' | 'canvas2d'): Renderer {
  return {
    backend,
    initialize: vi.fn().mockResolvedValue(undefined),
    createImageResource: vi.fn(),
    setScene: vi.fn(),
    setOverlay: vi.fn(),
    render: vi.fn().mockReturnValue({
      backend,
      correlationId: 'runtime-test',
      reasons: ['scene'],
      nodeCount: 0,
      startedAt: 0,
      duration: 1,
    }),
    exportPng: vi.fn(),
    dispose: vi.fn(),
  }
}

describe('RendererRuntime', () => {
  it('uses Canvas2D when primary startup fails', async () => {
    const fallback = renderer('canvas2d')
    const stack: CanvasStack = {
      scene: canvas(),
      overlay: canvas(),
      dpr: 1,
      correlationId: 'runtime-test',
    }
    const runtime = new RendererRuntime({
      stack,
      createPrimary: () => Promise.reject(new Error('WebGL unavailable')),
      createFallback: () => fallback,
      createReplacementSceneCanvas: canvas,
      activateSceneCanvas: vi.fn(),
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
    })

    await runtime.initialize()

    expect(runtime.state).toEqual({
      status: 'fallback',
      backend: 'canvas2d',
      reason: 'startupFailure',
    })
  })

  it('renders with Canvas2D during context loss and recreates CanvasKit', async () => {
    const firstPrimary = renderer('canvaskit')
    const restoredPrimary = renderer('canvaskit')
    const fallback = renderer('canvas2d')
    const primaryRenderers = [firstPrimary, restoredPrimary]
    const sceneCanvas = canvas()
    const activateSceneCanvas = vi.fn()
    const runtime = new RendererRuntime({
      stack: {
        scene: sceneCanvas,
        overlay: canvas(),
        dpr: 1,
        correlationId: 'runtime-test',
      },
      createPrimary: () => primaryRenderers.shift()!,
      createFallback: () => fallback,
      createReplacementSceneCanvas: canvas,
      activateSceneCanvas,
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
    })
    const scene = createRenderSceneSnapshot({
      width: 64,
      height: 64,
      nodes: [],
    })
    await runtime.initialize()
    runtime.setScene(scene)

    sceneCanvas.dispatchEvent(
      new Event('webglcontextlost', { cancelable: true }),
    )
    await vi.waitFor(() => expect(runtime.state.status).toBe('recovering'))
    expect(fallback.setScene).toHaveBeenCalledWith(scene)

    sceneCanvas.dispatchEvent(new Event('webglcontextrestored'))
    await vi.waitFor(() =>
      expect(runtime.state).toEqual({ status: 'ready', backend: 'canvaskit' }),
    )
    expect(restoredPrimary.setScene).toHaveBeenCalledWith(scene)
    expect(activateSceneCanvas).toHaveBeenLastCalledWith(sceneCanvas)

    sceneCanvas.dispatchEvent(new Event('webglcontextrestored'))
    await Promise.resolve()
    expect(restoredPrimary.initialize).toHaveBeenCalledTimes(1)
  })

  it('recreates image resources on fallback and restore', async () => {
    const firstPrimary = renderer('canvaskit')
    const restoredPrimary = renderer('canvaskit')
    const fallback = renderer('canvas2d')
    vi.mocked(firstPrimary.createImageResource).mockResolvedValue({
      id: 'image',
      width: 2,
      height: 2,
      dispose: vi.fn(),
    })
    vi.mocked(fallback.createImageResource).mockResolvedValue({
      id: 'image',
      width: 2,
      height: 2,
      dispose: vi.fn(),
    })
    vi.mocked(restoredPrimary.createImageResource).mockResolvedValue({
      id: 'image',
      width: 2,
      height: 2,
      dispose: vi.fn(),
    })
    const sceneCanvas = canvas()
    const primaryRenderers = [firstPrimary, restoredPrimary]
    const runtime = new RendererRuntime({
      stack: {
        scene: sceneCanvas,
        overlay: canvas(),
        dpr: 1,
        correlationId: 'resource-recovery-test',
      },
      createPrimary: () => primaryRenderers.shift()!,
      createFallback: () => fallback,
      createReplacementSceneCanvas: canvas,
      activateSceneCanvas: vi.fn(),
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
    })
    await runtime.initialize()
    await runtime.createImageResource({
      id: 'image',
      width: 2,
      height: 2,
      source: {} as ImageBitmap,
    })

    sceneCanvas.dispatchEvent(
      new Event('webglcontextlost', { cancelable: true }),
    )
    await vi.waitFor(() =>
      expect(fallback.createImageResource).toHaveBeenCalledTimes(1),
    )
    sceneCanvas.dispatchEvent(new Event('webglcontextrestored'))
    await vi.waitFor(() =>
      expect(restoredPrimary.createImageResource).toHaveBeenCalledTimes(1),
    )
  })
})
