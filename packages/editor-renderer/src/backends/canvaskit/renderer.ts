import type { RenderNode, RenderSceneSnapshot } from '@cute-screen/editor-core'
import { drawNodes2D } from '../canvas2d/nodes'
import type { InvalidationReason } from '../../scheduler'
import type {
  CanvasStack,
  FrameMetric,
  ImageResource,
  ImageResourceInput,
  Renderer,
  RenderExportOptions,
} from '../../types'
import type {
  CanvasKitApi,
  CanvasKitCanvas,
  CanvasKitFontData,
  CanvasKitImage,
  CanvasKitImageResource,
  CanvasKitPicture,
  CanvasKitSurface,
} from './contracts'
import { CanvasKitTypefaceStore } from './geometry'
import { drawNodesCanvasKit } from './nodes'
import { drawSnapshotCanvasKit } from './effects'
import { configurePaint } from './paint'
import { drawScene, renderCanvasKitPng } from './scene'

export function renderHeadlessCanvasKitPng(
  canvasKit: CanvasKitApi,
  scene: RenderSceneSnapshot,
  fontData: readonly CanvasKitFontData[] = [],
  options: RenderExportOptions = {},
): Uint8Array {
  const typefaces = new CanvasKitTypefaceStore(canvasKit, fontData)
  try {
    return renderCanvasKitPng(canvasKit, scene, new Map(), typefaces, options)
  } finally {
    typefaces.dispose()
  }
}

export class CanvasKitRenderer implements Renderer {
  readonly backend = 'canvaskit' as const
  readonly #canvasKit: CanvasKitApi
  readonly #now: () => number
  readonly #resources = new Map<string, CanvasKitImageResource>()
  readonly #typefaces: CanvasKitTypefaceStore
  #stack: CanvasStack | undefined
  #surface: CanvasKitSurface | undefined
  #scene: RenderSceneSnapshot | undefined
  #overlay: readonly RenderNode[] = []
  #picture: CanvasKitPicture | undefined
  #pictureScene: RenderSceneSnapshot | undefined
  #disposed = false

  constructor(
    canvasKit: CanvasKitApi,
    now: () => number = () => performance.now(),
    fontData: readonly CanvasKitFontData[] = [],
  ) {
    this.#canvasKit = canvasKit
    this.#now = now
    this.#typefaces = new CanvasKitTypefaceStore(canvasKit, fontData)
  }

  async initialize(stack: CanvasStack): Promise<void> {
    this.#assertActive()
    this.#stack = stack
    if (!stack.overlay.getContext('2d')) {
      this.#stack = undefined
      throw new Error('Canvas2D overlay context is unavailable')
    }
    const bounds = this.#scene?.outputBounds
    try {
      this.#replaceSurface(
        bounds?.width ?? Math.max(1, stack.scene.width),
        bounds?.height ?? Math.max(1, stack.scene.height),
      )
    } catch (error) {
      this.#stack = undefined
      throw error
    }
  }

  async createImageResource(input: ImageResourceInput): Promise<ImageResource> {
    this.#assertReady(false)
    this.#resources.get(input.id)?.dispose()
    const image = this.#surface!.makeImageFromTextureSource(input.source)
    if (!image) throw new Error(`CanvasKit texture load failed for ${input.id}`)
    const resource: CanvasKitImageResource = {
      id: input.id,
      width: input.width,
      height: input.height,
      source: input.source,
      image,
      dispose: () => {
        if (this.#resources.delete(input.id)) {
          this.#disposePicture()
          resource.image.delete()
        }
      },
    }
    this.#resources.set(resource.id, resource)
    this.#disposePicture()
    return resource
  }

  setScene(scene: RenderSceneSnapshot): void {
    this.#assertActive()
    this.#scene = scene
    if (this.#pictureScene !== scene) this.#disposePicture()
    if (this.#stack) {
      this.#replaceSurface(scene.outputBounds.width, scene.outputBounds.height)
    }
  }

  setOverlay(nodes: readonly RenderNode[]): void {
    this.#assertActive()
    this.#overlay = nodes
  }

  render(reasons: readonly InvalidationReason[]): FrameMetric {
    this.#assertReady()
    const startedAt = this.#now()
    if (
      reasons.some((reason) =>
        ['scene', 'viewport', 'resource', 'export'].includes(reason),
      )
    ) {
      this.#drawCommittedScene()
    }
    if (reasons.includes('overlay') || reasons.includes('viewport')) {
      const overlay = this.#stack!.overlay
      const bounds = this.#scene!.outputBounds
      overlay.width = Math.max(1, Math.round(bounds.width))
      overlay.height = Math.max(1, Math.round(bounds.height))
      const context = overlay.getContext('2d')!
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, overlay.width, overlay.height)
      context.setTransform(1, 0, 0, 1, -bounds.x, -bounds.y)
      drawNodes2D(context, this.#overlay)
    }
    return {
      backend: this.backend,
      correlationId: this.#stack!.correlationId,
      reasons: [...reasons],
      nodeCount: this.#scene!.nodes.length + this.#overlay.length,
      startedAt,
      duration: this.#now() - startedAt,
    }
  }

  async exportPng(options: RenderExportOptions = {}): Promise<Uint8Array> {
    this.#assertReady()
    return renderCanvasKitPng(
      this.#canvasKit,
      this.#scene!,
      this.#resources,
      this.#typefaces,
      options,
    )
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#disposePicture()
    for (const resource of [...this.#resources.values()]) resource.dispose()
    this.#typefaces.dispose()
    const surface = this.#surface
    const contextHandle = surface?.Gd
    surface?.dispose()
    if (contextHandle !== undefined) {
      this.#canvasKit.deleteContext(contextHandle)
    }
    this.#surface = undefined
    this.#stack = undefined
    this.#scene = undefined
  }

  #drawCommittedScene(): void {
    const scene = this.#scene!
    const cropped =
      scene.outputBounds.x !== 0 ||
      scene.outputBounds.y !== 0 ||
      scene.outputBounds.width !== scene.width ||
      scene.outputBounds.height !== scene.height
    if (cropped) {
      const working = this.#canvasKit.MakeSurface(scene.width, scene.height)
      if (!working) throw new Error('CanvasKit crop surface creation failed')
      try {
        drawScene(
          this.#canvasKit,
          working,
          scene,
          this.#resources,
          this.#typefaces,
        )
        const image = working.makeImageSnapshot()
        try {
          const canvas = this.#surface!.getCanvas()
          canvas.clear(this.#canvasKit.TRANSPARENT)
          const paint = new this.#canvasKit.Paint()
          try {
            paint.setAntiAlias(false)
            paint.setColorComponents(1, 1, 1, 1)
            drawSnapshotCanvasKit(
              this.#canvasKit,
              canvas,
              image,
              this.#canvasKit.XYWHRect(
                scene.outputBounds.x,
                scene.outputBounds.y,
                scene.outputBounds.width,
                scene.outputBounds.height,
              ),
              this.#canvasKit.XYWHRect(
                0,
                0,
                scene.outputBounds.width,
                scene.outputBounds.height,
              ),
              paint,
            )
          } finally {
            paint.delete()
          }
          this.#surface!.flush()
        } finally {
          image.delete()
        }
      } finally {
        working.dispose()
      }
      return
    }

    const canvas = this.#surface!.getCanvas()
    const picture = this.#pictureForScene()
    canvas.clear(this.#canvasKit.TRANSPARENT)
    if (picture && canvas.drawPicture) {
      canvas.drawPicture(picture)
      this.#surface!.flush()
      return
    }
    drawScene(
      this.#canvasKit,
      this.#surface!,
      this.#scene!,
      this.#resources,
      this.#typefaces,
    )
  }

  #pictureForScene(): CanvasKitPicture | undefined {
    if (this.#picture && this.#pictureScene === this.#scene)
      return this.#picture
    const PictureRecorder = this.#canvasKit.PictureRecorder
    if (!PictureRecorder || !this.#scene) return undefined
    const scene = this.#scene
    const fullOutput =
      scene.outputBounds.x === 0 &&
      scene.outputBounds.y === 0 &&
      scene.outputBounds.width === scene.width &&
      scene.outputBounds.height === scene.height
    if (
      !fullOutput ||
      scene.nodes.some((node) =>
        ['censor', 'spotlight', 'loupe'].includes(node.kind),
      )
    ) {
      return undefined
    }
    const recorder = new PictureRecorder()
    try {
      const recording = recorder.beginRecording(
        this.#canvasKit.XYWHRect(0, 0, this.#scene.width, this.#scene.height),
      )
      for (const node of this.#scene.nodes) {
        if (node.kind === 'image') {
          this.#drawImageNode(recording, node)
        } else {
          drawNodesCanvasKit(
            this.#canvasKit,
            recording,
            [node],
            this.#resources,
            this.#typefaces,
          )
        }
      }
      this.#picture = recorder.finishRecordingAsPicture()
      this.#pictureScene = this.#scene
      return this.#picture
    } finally {
      recorder.delete()
    }
  }

  #drawImageNode(
    canvas: CanvasKitCanvas,
    node: Extract<RenderNode, { kind: 'image' }>,
  ): void {
    if (!node.visible || node.opacity === 0) return
    const resource = this.#resources.get(node.resourceId)
    const fill = new this.#canvasKit.Paint()
    const stroke = new this.#canvasKit.Paint()
    try {
      canvas.save()
      canvas.translate(node.x, node.y)
      canvas.rotate(node.rotation, 0, 0)
      canvas.scale(node.scaleX, node.scaleY)
      const bounds = this.#canvasKit.XYWHRect(0, 0, node.width, node.height)
      const rounded =
        (node.cornerRadius ?? 0) > 0
          ? this.#canvasKit.RRectXY(
              bounds,
              node.cornerRadius ?? 0,
              node.cornerRadius ?? 0,
            )
          : undefined
      if (rounded) {
        canvas.clipRRect?.(rounded, this.#canvasKit.ClipOp?.Intersect, true)
      }
      if (resource) {
        fill.setAntiAlias(true)
        fill.setColorComponents(1, 1, 1, node.opacity)
        canvas.drawImageRect(
          resource.image,
          this.#canvasKit.XYWHRect(0, 0, resource.width, resource.height),
          bounds,
          fill,
          false,
        )
      } else {
        configurePaint(
          this.#canvasKit,
          fill,
          { red: 0.72, green: 0.28, blue: 0.28, alpha: 0.16 },
          node.opacity,
          'fill',
        )
        configurePaint(
          this.#canvasKit,
          stroke,
          { red: 0.72, green: 0.28, blue: 0.28, alpha: 0.9 },
          node.opacity,
          'stroke',
        )
        if (rounded && canvas.drawRRect) {
          canvas.drawRRect(rounded, fill)
          canvas.drawRRect(rounded, stroke)
        } else {
          canvas.drawRect(bounds, fill)
          canvas.drawRect(bounds, stroke)
        }
      }
      if (node.stroke && (node.strokeWidth ?? 0) > 0) {
        configurePaint(
          this.#canvasKit,
          stroke,
          node.stroke,
          node.opacity,
          'stroke',
          node.strokeWidth ?? 1,
        )
        stroke.setStrokeJoin(
          node.lineJoin === 'round'
            ? this.#canvasKit.StrokeJoin.Round
            : node.lineJoin === 'bevel'
              ? this.#canvasKit.StrokeJoin.Bevel
              : this.#canvasKit.StrokeJoin.Miter,
        )
        if (rounded && canvas.drawRRect) canvas.drawRRect(rounded, stroke)
        else canvas.drawRect(bounds, stroke)
      }
    } finally {
      canvas.restore()
      fill.delete()
      stroke.delete()
    }
  }

  #disposePicture(): void {
    this.#picture?.delete()
    this.#picture = undefined
    this.#pictureScene = undefined
  }

  #replaceSurface(width: number, height: number): void {
    const stack = this.#stack
    if (!stack) return
    const targetWidth = Math.max(1, Math.round(width))
    const targetHeight = Math.max(1, Math.round(height))
    const sizeChanged =
      stack.scene.width !== targetWidth ||
      stack.scene.height !== targetHeight ||
      !this.#surface
    stack.scene.style.width = `${targetWidth}px`
    stack.scene.style.height = `${targetHeight}px`
    stack.overlay.style.width = `${targetWidth}px`
    stack.overlay.style.height = `${targetHeight}px`
    if (!sizeChanged) return

    this.#disposePicture()
    const previousSurface = this.#surface
    const previousContext = previousSurface?.Gd
    previousSurface?.dispose()
    if (previousContext !== undefined) {
      this.#canvasKit.deleteContext(previousContext)
    }
    this.#surface = undefined

    stack.scene.width = targetWidth
    stack.scene.height = targetHeight
    stack.overlay.width = targetWidth
    stack.overlay.height = targetHeight
    const surface = this.#canvasKit.MakeWebGLCanvasSurface(stack.scene)
    if (!surface) throw new Error('CanvasKit WebGL surface creation failed')
    // CanvasKit silently swaps the DOM canvas for a software surface when the
    // GPU surface cannot be made. Runtime owns fallback explicitly so pointer
    // listeners, telemetry and backend state stay coherent.
    if (!stack.scene.isConnected) {
      const contextHandle = surface.Gd
      surface.dispose()
      if (contextHandle !== undefined) {
        this.#canvasKit.deleteContext(contextHandle)
      }
      throw new Error(
        'CanvasKit replaced the scene canvas with a software surface',
      )
    }

    const replacements = new Map<string, CanvasKitImage>()
    try {
      for (const [id, resource] of this.#resources) {
        const image = surface.makeImageFromTextureSource(resource.source)
        if (!image) {
          throw new Error(`CanvasKit texture reload failed for ${id}`)
        }
        replacements.set(id, image)
      }
    } catch (error) {
      for (const image of replacements.values()) image.delete()
      const contextHandle = surface.Gd
      surface.dispose()
      if (contextHandle !== undefined) {
        this.#canvasKit.deleteContext(contextHandle)
      }
      throw error
    }
    for (const [id, image] of replacements) {
      const resource = this.#resources.get(id)!
      resource.image.delete()
      resource.image = image
    }
    this.#surface = surface
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('CanvasKit renderer is disposed')
  }

  #assertReady(requireScene = true): void {
    this.#assertActive()
    if (!this.#surface || !this.#stack) {
      throw new Error('CanvasKit renderer is not initialized')
    }
    if (requireScene && !this.#scene) {
      throw new Error('CanvasKit renderer has no scene')
    }
  }
}
