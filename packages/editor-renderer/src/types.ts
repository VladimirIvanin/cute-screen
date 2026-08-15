import type { RenderNode, RenderSceneSnapshot } from '@cute-screen/editor-core'

import type { InvalidationReason } from './scheduler'

export type RendererBackend = 'canvaskit' | 'canvas2d'

export interface CanvasStack {
  readonly scene: HTMLCanvasElement
  readonly overlay: HTMLCanvasElement
  readonly dpr: number
  readonly correlationId: string
}

export interface ImageResourceInput {
  readonly id: string
  readonly width: number
  readonly height: number
  readonly source: HTMLImageElement | HTMLVideoElement | ImageBitmap
}

export interface ImageResource {
  readonly id: string
  readonly width: number
  readonly height: number
  dispose(): void
}

export interface FrameMetric {
  readonly backend: RendererBackend
  readonly correlationId: string
  readonly reasons: readonly InvalidationReason[]
  readonly nodeCount: number
  readonly startedAt: number
  readonly duration: number
}

/** Optional, non-production instrumentation around one renderer frame. */
export interface FrameProbe {
  beforeFrame(reasons: readonly InvalidationReason[]): void
  afterFrame(metric: FrameMetric): void
}

export interface RenderExportOptions {
  readonly scale?: number
}

export interface Renderer {
  readonly backend: RendererBackend
  initialize(stack: CanvasStack): Promise<void>
  createImageResource(input: ImageResourceInput): Promise<ImageResource>
  setScene(scene: RenderSceneSnapshot): void
  setOverlay(nodes: readonly RenderNode[]): void
  render(reasons: readonly InvalidationReason[]): FrameMetric
  exportPng(options?: RenderExportOptions): Promise<Uint8Array>
  dispose(): void
}

export type RendererRuntimeState =
  | Readonly<{ status: 'initializing'; backend: 'canvaskit' }>
  | Readonly<{ status: 'ready'; backend: RendererBackend }>
  | Readonly<{
      status: 'recovering'
      backend: 'canvas2d'
      reason: 'contextLost'
    }>
  | Readonly<{
      status: 'fallback'
      backend: 'canvas2d'
      reason: 'startupFailure' | 'recoveryFailure'
    }>
  | Readonly<{ status: 'disposed'; backend: RendererBackend }>
