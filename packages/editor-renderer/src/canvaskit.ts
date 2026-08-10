import type {
  RenderNode,
  RenderSceneSnapshot,
  RgbaColor,
} from '@cute-screen/editor-core'

import type { InvalidationReason } from './scheduler'
import { drawNodes2D } from './canvas2d'
import type {
  CanvasStack,
  FrameMetric,
  ImageResource,
  ImageResourceInput,
  Renderer,
} from './types'

interface CanvasKitImageResource extends ImageResource {
  readonly image: CanvasKitImage
}

interface CanvasKitDeletable {
  delete(): void
}

interface CanvasKitPaint extends CanvasKitDeletable {
  setAntiAlias(value: boolean): void
  setColorComponents(
    red: number,
    green: number,
    blue: number,
    alpha: number,
  ): void
  setStyle(style: unknown): void
  setStrokeWidth(width: number): void
}

interface CanvasKitImage extends CanvasKitDeletable {
  encodeToBytes(format: unknown): Uint8Array | null
}

interface CanvasKitCanvas {
  clear(color: unknown): void
  save(): number
  restore(): void
  rotate(rotation: number, centerX: number, centerY: number): void
  translate(x: number, y: number): void
  scale(x: number, y: number): void
  drawRect(rect: Float32Array, paint: CanvasKitPaint): void
  drawOval(rect: Float32Array, paint: CanvasKitPaint): void
  drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    paint: CanvasKitPaint,
  ): void
  drawImageRect(
    image: CanvasKitImage,
    source: Float32Array,
    destination: Float32Array,
    paint: CanvasKitPaint,
    fastSample?: boolean,
  ): void
  drawPicture?(picture: CanvasKitPicture): void
}

type CanvasKitPicture = CanvasKitDeletable

interface CanvasKitPictureRecorder extends CanvasKitDeletable {
  beginRecording(bounds: Float32Array): CanvasKitCanvas
  finishRecordingAsPicture(): CanvasKitPicture
}

interface CanvasKitSurface {
  readonly Gd?: number
  getCanvas(): CanvasKitCanvas
  flush(): void
  makeImageSnapshot(): CanvasKitImage
  makeImageFromTextureSource(
    source: ImageResourceInput['source'],
  ): CanvasKitImage | null
  dispose(): void
}

export interface CanvasKitApi {
  readonly Paint: new () => CanvasKitPaint
  readonly PaintStyle: Readonly<{ Fill: unknown; Stroke: unknown }>
  readonly ImageFormat: Readonly<{ PNG: unknown }>
  readonly TRANSPARENT: unknown
  readonly PictureRecorder?: new () => CanvasKitPictureRecorder
  XYWHRect(x: number, y: number, width: number, height: number): Float32Array
  LTRBRect(
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): Float32Array
  MakeSurface(width: number, height: number): CanvasKitSurface | null
  MakeWebGLCanvasSurface(canvas: HTMLCanvasElement): CanvasKitSurface | null
  deleteContext(handle: number): void
}

function configurePaint(
  canvasKit: CanvasKitApi,
  paint: CanvasKitPaint,
  color: RgbaColor,
  opacity: number,
  style: 'fill' | 'stroke',
  strokeWidth = 1,
): void {
  paint.setAntiAlias(true)
  paint.setColorComponents(
    color.red,
    color.green,
    color.blue,
    color.alpha * opacity,
  )
  paint.setStyle(
    style === 'fill' ? canvasKit.PaintStyle.Fill : canvasKit.PaintStyle.Stroke,
  )
  if (style === 'stroke') paint.setStrokeWidth(strokeWidth)
}

function withRotation(
  canvas: CanvasKitCanvas,
  node: RenderNode,
  centerX: number,
  centerY: number,
  draw: () => void,
): void {
  canvas.save()
  if (node.rotation !== 0) canvas.rotate(node.rotation, centerX, centerY)
  draw()
  canvas.restore()
}

export function drawNodesCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  nodes: readonly RenderNode[],
): void {
  for (const node of nodes) {
    if (!node.visible || node.opacity === 0) continue
    const fill = new canvasKit.Paint()
    const stroke = new canvasKit.Paint()
    try {
      switch (node.kind) {
        case 'rect': {
          const rect = canvasKit.XYWHRect(
            node.x,
            node.y,
            node.width,
            node.height,
          )
          withRotation(
            canvas,
            node,
            node.x + node.width / 2,
            node.y + node.height / 2,
            () => {
              configurePaint(canvasKit, fill, node.fill, node.opacity, 'fill')
              canvas.drawRect(rect, fill)
              if (node.stroke && (node.strokeWidth ?? 0) > 0) {
                configurePaint(
                  canvasKit,
                  stroke,
                  node.stroke,
                  node.opacity,
                  'stroke',
                  node.strokeWidth,
                )
                canvas.drawRect(rect, stroke)
              }
            },
          )
          break
        }
        case 'ellipse': {
          const oval = canvasKit.LTRBRect(
            node.centerX - node.radiusX,
            node.centerY - node.radiusY,
            node.centerX + node.radiusX,
            node.centerY + node.radiusY,
          )
          withRotation(canvas, node, node.centerX, node.centerY, () => {
            configurePaint(canvasKit, fill, node.fill, node.opacity, 'fill')
            canvas.drawOval(oval, fill)
            if (node.stroke && (node.strokeWidth ?? 0) > 0) {
              configurePaint(
                canvasKit,
                stroke,
                node.stroke,
                node.opacity,
                'stroke',
                node.strokeWidth,
              )
              canvas.drawOval(oval, stroke)
            }
          })
          break
        }
        case 'line':
          withRotation(
            canvas,
            node,
            (node.x1 + node.x2) / 2,
            (node.y1 + node.y2) / 2,
            () => {
              configurePaint(
                canvasKit,
                stroke,
                node.stroke,
                node.opacity,
                'stroke',
                node.strokeWidth,
              )
              canvas.drawLine(node.x1, node.y1, node.x2, node.y2, stroke)
            },
          )
          break
      }
    } finally {
      fill.delete()
      stroke.delete()
    }
  }
}

function drawScene(
  canvasKit: CanvasKitApi,
  surface: CanvasKitSurface,
  scene: RenderSceneSnapshot,
  resources: ReadonlyMap<string, CanvasKitImageResource>,
): void {
  const canvas = surface.getCanvas()
  canvas.clear(canvasKit.TRANSPARENT)
  for (const node of scene.nodes) {
    if (node.kind !== 'image') {
      drawNodesCanvasKit(canvasKit, canvas, [node])
      continue
    }
    if (!node.visible || node.opacity === 0) continue
    const resource = resources.get(node.resourceId)
    const fill = new canvasKit.Paint()
    const stroke = new canvasKit.Paint()
    try {
      canvas.save()
      canvas.translate(node.x, node.y)
      canvas.rotate(node.rotation, 0, 0)
      canvas.scale(node.scaleX, node.scaleY)
      if (resource) {
        fill.setAntiAlias(true)
        fill.setColorComponents(1, 1, 1, node.opacity)
        canvas.drawImageRect(
          resource.image,
          canvasKit.XYWHRect(0, 0, resource.width, resource.height),
          canvasKit.XYWHRect(0, 0, node.width, node.height),
          fill,
          false,
        )
      } else {
        configurePaint(
          canvasKit,
          fill,
          { red: 0.72, green: 0.28, blue: 0.28, alpha: 0.16 },
          node.opacity,
          'fill',
        )
        configurePaint(
          canvasKit,
          stroke,
          { red: 0.72, green: 0.28, blue: 0.28, alpha: 0.9 },
          node.opacity,
          'stroke',
        )
        const bounds = canvasKit.XYWHRect(0, 0, node.width, node.height)
        canvas.drawRect(bounds, fill)
        canvas.drawRect(bounds, stroke)
      }
    } finally {
      canvas.restore()
      fill.delete()
      stroke.delete()
    }
  }
  surface.flush()
}

export function renderHeadlessCanvasKitPng(
  canvasKit: CanvasKitApi,
  scene: RenderSceneSnapshot,
): Uint8Array {
  const surface = canvasKit.MakeSurface(scene.width, scene.height)
  if (!surface) throw new Error('CanvasKit headless surface creation failed')
  try {
    drawScene(canvasKit, surface, scene, new Map())
    const image = surface.makeImageSnapshot()
    try {
      const bytes = image.encodeToBytes(canvasKit.ImageFormat.PNG)
      if (!bytes) throw new Error('CanvasKit PNG encoding failed')
      return new Uint8Array(bytes)
    } finally {
      image.delete()
    }
  } finally {
    surface.dispose()
  }
}

export class CanvasKitRenderer implements Renderer {
  readonly backend = 'canvaskit' as const
  readonly #canvasKit: CanvasKitApi
  readonly #now: () => number
  readonly #resources = new Map<string, CanvasKitImageResource>()
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
  ) {
    this.#canvasKit = canvasKit
    this.#now = now
  }

  async initialize(stack: CanvasStack): Promise<void> {
    this.#assertActive()
    const surface = this.#canvasKit.MakeWebGLCanvasSurface(stack.scene)
    if (!surface) throw new Error('CanvasKit WebGL surface creation failed')
    // CanvasKit silently swaps the DOM canvas for a software surface when the
    // GPU surface cannot be made. Runtime owns fallback explicitly so pointer
    // listeners, telemetry and backend state stay coherent.
    if (!stack.scene.isConnected) {
      surface.dispose()
      throw new Error(
        'CanvasKit replaced the scene canvas with a software surface',
      )
    }
    this.#stack = stack
    this.#surface = surface
    if (!stack.overlay.getContext('2d')) {
      surface.dispose()
      this.#surface = undefined
      throw new Error('Canvas2D overlay context is unavailable')
    }
  }

  async createImageResource(input: ImageResourceInput): Promise<ImageResource> {
    this.#assertReady(false)
    const image = this.#surface!.makeImageFromTextureSource(input.source)
    if (!image) throw new Error(`CanvasKit texture load failed for ${input.id}`)
    const resource: CanvasKitImageResource = {
      id: input.id,
      width: input.width,
      height: input.height,
      image,
      dispose: () => {
        if (this.#resources.delete(input.id)) {
          this.#disposePicture()
          image.delete()
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
      const context = overlay.getContext('2d')!
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, overlay.width, overlay.height)
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

  async exportPng(): Promise<Uint8Array> {
    this.#assertReady()
    drawScene(this.#canvasKit, this.#surface!, this.#scene!, this.#resources)
    const image = this.#surface!.makeImageSnapshot()
    try {
      const bytes = image.encodeToBytes(this.#canvasKit.ImageFormat.PNG)
      if (!bytes) throw new Error('CanvasKit PNG encoding failed')
      return new Uint8Array(bytes)
    } finally {
      image.delete()
    }
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const resource of [...this.#resources.values()]) resource.dispose()
    const surface = this.#surface
    const contextHandle = surface?.Gd
    surface?.dispose()
    if (contextHandle !== undefined) {
      this.#canvasKit.deleteContext(contextHandle)
    }
    this.#surface = undefined
    this.#stack = undefined
    this.#scene = undefined
    this.#disposePicture()
  }

  #drawCommittedScene(): void {
    const canvas = this.#surface!.getCanvas()
    const picture = this.#pictureForScene()
    canvas.clear(this.#canvasKit.TRANSPARENT)
    if (picture && canvas.drawPicture) {
      canvas.drawPicture(picture)
      this.#surface!.flush()
      return
    }
    drawScene(this.#canvasKit, this.#surface!, this.#scene!, this.#resources)
  }

  #pictureForScene(): CanvasKitPicture | undefined {
    if (this.#picture && this.#pictureScene === this.#scene)
      return this.#picture
    const PictureRecorder = this.#canvasKit.PictureRecorder
    if (!PictureRecorder || !this.#scene) return undefined
    const recorder = new PictureRecorder()
    try {
      const recording = recorder.beginRecording(
        this.#canvasKit.XYWHRect(0, 0, this.#scene.width, this.#scene.height),
      )
      for (const node of this.#scene.nodes) {
        if (node.kind === 'image') {
          this.#drawImageNode(recording, node)
        } else {
          drawNodesCanvasKit(this.#canvasKit, recording, [node])
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
      if (resource) {
        fill.setAntiAlias(true)
        fill.setColorComponents(1, 1, 1, node.opacity)
        canvas.drawImageRect(
          resource.image,
          this.#canvasKit.XYWHRect(0, 0, resource.width, resource.height),
          this.#canvasKit.XYWHRect(0, 0, node.width, node.height),
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
        const bounds = this.#canvasKit.XYWHRect(0, 0, node.width, node.height)
        canvas.drawRect(bounds, fill)
        canvas.drawRect(bounds, stroke)
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
