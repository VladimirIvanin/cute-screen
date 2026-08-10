import type {
  RenderNode,
  RenderPaint,
  RenderSceneSnapshot,
  RgbaColor,
} from '@cute-screen/editor-core'

import type { InvalidationReason } from './scheduler'
import type {
  CanvasStack,
  FrameMetric,
  ImageResource,
  ImageResourceInput,
  Renderer,
} from './types'

type Context2D = Pick<
  CanvasRenderingContext2D,
  | 'clearRect'
  | 'drawImage'
  | 'fillRect'
  | 'strokeRect'
  | 'beginPath'
  | 'ellipse'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'clip'
  | 'quadraticCurveTo'
  | 'fill'
  | 'stroke'
  | 'save'
  | 'restore'
  | 'translate'
  | 'scale'
  | 'rotate'
  | 'setTransform'
  | 'globalAlpha'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'globalCompositeOperation'
  | 'createLinearGradient'
  | 'createRadialGradient'
  | 'createPattern'
  | 'setLineDash'
  | 'fillText'
  | 'strokeText'
  | 'measureText'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'shadowColor'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
  | 'shadowBlur'
>

export interface Canvas2DLike {
  width: number
  height: number
  getContext(type: '2d'): Context2D | null
  toBlob?: (callback: BlobCallback, type?: string) => void
  encode?: (format: 'png') => Promise<Uint8Array>
}

interface Canvas2DImageResource extends ImageResource {
  readonly source: ImageResourceInput['source']
}

export interface Canvas2DRendererOptions {
  readonly now?: () => number
  readonly exportCanvas?: (width: number, height: number) => Canvas2DLike
}

function cssColor(color: RgbaColor): string {
  return `rgba(${Math.round(color.red * 255)}, ${Math.round(
    color.green * 255,
  )}, ${Math.round(color.blue * 255)}, ${color.alpha})`
}

function cssBlendMode(mode: RenderNode['blendMode']): GlobalCompositeOperation {
  switch (mode) {
    case 'multiply':
      return 'multiply'
    case 'screen':
      return 'screen'
    case 'overlay':
      return 'overlay'
    case 'darken':
      return 'darken'
    case 'lighten':
      return 'lighten'
    case 'softLight':
      return 'soft-light'
    case 'hardLight':
      return 'hard-light'
    default:
      return 'source-over'
  }
}

function paintStyle(
  context: Context2D,
  paint: RenderPaint,
  resources: ReadonlyMap<string, ImageResourceInput['source']> = new Map(),
): string | CanvasGradient | CanvasPattern {
  if (!('kind' in paint)) return cssColor(paint)
  if (paint.kind === 'imageTexture') {
    const resource = resources.get(paint.resourceId)
    if (!resource) return 'rgba(229, 72, 77, 0.16)'
    const pattern = context.createPattern(resource, 'repeat')
    if (!pattern) return 'rgba(229, 72, 77, 0.16)'
    if (
      typeof pattern.setTransform === 'function' &&
      typeof DOMMatrix !== 'undefined'
    ) {
      const transform = new DOMMatrix()
        .translate(paint.offsetX, paint.offsetY)
        .rotate(paint.rotation)
        .scale(paint.scale)
      pattern.setTransform(transform)
    }
    return pattern
  }
  const gradient =
    paint.kind === 'linearGradient'
      ? context.createLinearGradient(
          paint.startX,
          paint.startY,
          paint.endX,
          paint.endY,
        )
      : context.createRadialGradient(
          paint.centerX,
          paint.centerY,
          0,
          paint.centerX,
          paint.centerY,
          paint.radius,
        )
  for (const stop of paint.stops)
    gradient.addColorStop(stop.position, cssColor(stop.color))
  return gradient
}

function withRotation(
  context: Context2D,
  node: RenderNode,
  centerX: number,
  centerY: number,
  draw: () => void,
): void {
  context.save()
  context.globalAlpha = node.opacity
  context.globalCompositeOperation = cssBlendMode(node.blendMode)
  if (node.rotation !== 0) {
    context.translate(centerX, centerY)
    context.rotate((node.rotation * Math.PI) / 180)
    context.translate(-centerX, -centerY)
  }
  draw()
  context.restore()
}

function roundedRectPath(
  context: Context2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const corner = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + corner, y)
  context.lineTo(x + width - corner, y)
  context.quadraticCurveTo(x + width, y, x + width, y + corner)
  context.lineTo(x + width, y + height - corner)
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - corner,
    y + height,
  )
  context.lineTo(x + corner, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - corner)
  context.lineTo(x, y + corner)
  context.quadraticCurveTo(x, y, x + corner, y)
  context.closePath()
}

export function drawNodes2D(
  context: Context2D,
  nodes: readonly RenderNode[],
  resources: ReadonlyMap<string, ImageResourceInput['source']> = new Map(),
): void {
  for (const node of nodes) {
    if (!node.visible || node.opacity === 0) continue
    switch (node.kind) {
      case 'rect': {
        const centerX = node.x + node.width / 2
        const centerY = node.y + node.height / 2
        withRotation(context, node, centerX, centerY, () => {
          context.fillStyle = paintStyle(context, node.fill, resources)
          if (node.stroke && (node.strokeWidth ?? 0) > 0) {
            context.strokeStyle = cssColor(node.stroke)
            context.lineWidth = node.strokeWidth ?? 1
            context.lineJoin = node.lineJoin ?? 'miter'
          }
          if ((node.cornerRadius ?? 0) > 0) {
            roundedRectPath(
              context,
              node.x,
              node.y,
              node.width,
              node.height,
              node.cornerRadius ?? 0,
            )
            context.fill()
          } else {
            context.fillRect(node.x, node.y, node.width, node.height)
          }
          if (node.stroke && (node.strokeWidth ?? 0) > 0) {
            context.strokeStyle = cssColor(node.stroke)
            context.lineWidth = node.strokeWidth ?? 1
            context.lineJoin = node.lineJoin ?? 'miter'
            if ((node.cornerRadius ?? 0) > 0) context.stroke()
            else context.strokeRect(node.x, node.y, node.width, node.height)
          }
        })
        break
      }
      case 'ellipse':
        withRotation(context, node, node.centerX, node.centerY, () => {
          context.beginPath()
          context.ellipse(
            node.centerX,
            node.centerY,
            node.radiusX,
            node.radiusY,
            0,
            0,
            Math.PI * 2,
          )
          context.fillStyle = paintStyle(context, node.fill, resources)
          context.fill()
          if (node.stroke && (node.strokeWidth ?? 0) > 0) {
            context.strokeStyle = cssColor(node.stroke)
            context.lineWidth = node.strokeWidth ?? 1
            context.lineJoin = node.lineJoin ?? 'miter'
            context.stroke()
          }
        })
        break
      case 'line': {
        const centerX = (node.x1 + node.x2) / 2
        const centerY = (node.y1 + node.y2) / 2
        withRotation(context, node, centerX, centerY, () => {
          context.beginPath()
          context.moveTo(node.x1, node.y1)
          context.lineTo(node.x2, node.y2)
          context.strokeStyle = cssColor(node.stroke)
          context.lineWidth = node.strokeWidth
          context.lineCap = node.lineCap ?? 'butt'
          context.lineJoin = node.lineJoin ?? 'miter'
          context.setLineDash(node.dash ? [...node.dash] : [])
          context.stroke()
        })
        break
      }
      case 'path': {
        const centerX =
          (Math.min(...node.points.map((point) => point.x)) +
            Math.max(...node.points.map((point) => point.x))) /
          2
        const centerY =
          (Math.min(...node.points.map((point) => point.y)) +
            Math.max(...node.points.map((point) => point.y))) /
          2
        withRotation(context, node, centerX, centerY, () => {
          context.beginPath()
          context.moveTo(node.points[0]!.x, node.points[0]!.y)
          for (const point of node.points.slice(1))
            context.lineTo(point.x, point.y)
          context.strokeStyle = cssColor(node.stroke)
          context.lineWidth = node.strokeWidth
          context.lineCap = node.lineCap ?? 'butt'
          context.lineJoin = node.lineJoin ?? 'miter'
          context.setLineDash(node.dash ? [...node.dash] : [])
          context.stroke()
        })
        break
      }
      case 'polygon': {
        const first = node.points[0]!
        const centerX =
          node.points.reduce((total, point) => total + point.x, 0) /
          node.points.length
        const centerY =
          node.points.reduce((total, point) => total + point.y, 0) /
          node.points.length
        withRotation(context, node, centerX, centerY, () => {
          context.beginPath()
          context.moveTo(first.x, first.y)
          for (const point of node.points.slice(1))
            context.lineTo(point.x, point.y)
          context.closePath()
          context.fillStyle = paintStyle(context, node.fill, resources)
          context.fill()
          if (node.stroke && (node.strokeWidth ?? 0) > 0) {
            context.strokeStyle = cssColor(node.stroke)
            context.lineWidth = node.strokeWidth ?? 1
            context.lineJoin = node.lineJoin ?? 'miter'
            context.stroke()
          }
        })
        break
      }
      case 'image':
        // Image resources are resolved by the renderer; no placeholder is drawn
        // here so overlays stay independent from committed scene rendering.
        break
      case 'text': {
        const centerX = node.x + node.width / 2
        const centerY = node.y + node.height / 2
        withRotation(context, node, centerX, centerY, () => {
          context.font = `${node.fontStyle} ${node.fontWeight} ${node.fontSize}px "${node.fontFamily.replaceAll('"', '')}", sans-serif`
          context.textBaseline = 'top'
          context.textAlign =
            node.align === 'center'
              ? 'center'
              : node.align === 'end'
                ? 'right'
                : 'left'
          context.fillStyle = paintStyle(context, node.fill, resources)
          const x =
            node.align === 'center'
              ? node.x + node.width / 2
              : node.align === 'end'
                ? node.x + node.width
                : node.x
          const drawLine = (
            line: string,
            y: number,
            draw: (text: string, x: number, y: number) => void,
          ): void => {
            const spacing = node.letterSpacing ?? 0
            if (spacing === 0) {
              draw(line, x, y)
              return
            }
            const characters = Array.from(line)
            const width = characters.reduce(
              (total, character, index) =>
                total +
                context.measureText(character).width +
                (index === characters.length - 1 ? 0 : spacing),
              0,
            )
            let cursor =
              node.align === 'center'
                ? x - width / 2
                : node.align === 'end'
                  ? x - width
                  : x
            for (const character of characters) {
              draw(character, cursor, y)
              cursor += context.measureText(character).width + spacing
            }
          }
          for (const shadow of node.shadows ?? []) {
            context.shadowColor = cssColor(shadow.color)
            context.shadowOffsetX = shadow.offsetX
            context.shadowOffsetY = shadow.offsetY
            context.shadowBlur = shadow.blur
            // Draw a colored source as well as its shadow; the final text pass
            // below covers the source while retaining the blurred perimeter.
            context.fillStyle = cssColor(shadow.color)
            for (const [index, line] of node.text.split('\n').entries()) {
              drawLine(line, node.y + index * node.lineHeight, (text, x, y) =>
                context.fillText(text, x, y),
              )
            }
          }
          context.shadowColor = 'rgba(0, 0, 0, 0)'
          context.shadowOffsetX = 0
          context.shadowOffsetY = 0
          context.shadowBlur = 0
          for (const [index, line] of node.text.split('\n').entries()) {
            if (node.stroke && (node.strokeWidth ?? 0) > 0) {
              drawLine(line, node.y + index * node.lineHeight, (text, x, y) =>
                context.strokeText(text, x, y),
              )
            }
            drawLine(line, node.y + index * node.lineHeight, (text, x, y) =>
              context.fillText(text, x, y),
            )
          }
          if (node.underline) {
            context.strokeStyle = paintStyle(context, node.fill, resources)
            context.lineWidth = Math.max(1, node.fontSize * 0.06)
            for (const [index, line] of node.text.split('\n').entries()) {
              const spacing = node.letterSpacing ?? 0
              const characters = Array.from(line)
              const width =
                spacing === 0
                  ? context.measureText(line).width
                  : characters.reduce(
                      (total, character, characterIndex) =>
                        total +
                        context.measureText(character).width +
                        (characterIndex === characters.length - 1
                          ? 0
                          : spacing),
                      0,
                    )
              const startX =
                node.align === 'center'
                  ? x - width / 2
                  : node.align === 'end'
                    ? x - width
                    : x
              const underlineY =
                node.y + index * node.lineHeight + node.fontSize * 1.06
              context.beginPath()
              context.moveTo(startX, underlineY)
              context.lineTo(startX + width, underlineY)
              context.stroke()
            }
          }
        })
        break
      }
    }
  }
}

export class Canvas2DRenderer implements Renderer {
  readonly backend = 'canvas2d' as const
  readonly #now: () => number
  readonly #exportCanvas?: Canvas2DRendererOptions['exportCanvas']
  readonly #resources = new Map<string, Canvas2DImageResource>()
  #stack: CanvasStack | undefined
  #scene: RenderSceneSnapshot | undefined
  #overlay: readonly RenderNode[] = []
  #disposed = false

  constructor(options: Canvas2DRendererOptions = {}) {
    this.#now = options.now ?? (() => performance.now())
    this.#exportCanvas = options.exportCanvas
  }

  async initialize(stack: CanvasStack): Promise<void> {
    this.#assertActive()
    if (!stack.scene.getContext('2d') || !stack.overlay.getContext('2d')) {
      throw new Error('Canvas2D context is unavailable')
    }
    this.#stack = stack
  }

  async createImageResource(input: ImageResourceInput): Promise<ImageResource> {
    this.#assertActive()
    const resource: Canvas2DImageResource = {
      ...input,
      dispose: () => this.#resources.delete(input.id),
    }
    this.#resources.set(resource.id, resource)
    return resource
  }

  setScene(scene: RenderSceneSnapshot): void {
    this.#assertActive()
    this.#scene = scene
  }

  setOverlay(nodes: readonly RenderNode[]): void {
    this.#assertActive()
    this.#overlay = nodes
  }

  render(reasons: readonly InvalidationReason[]): FrameMetric {
    this.#assertReady()
    const startedAt = this.#now()
    const scene = this.#scene!
    const stack = this.#stack!
    if (
      reasons.some((reason) =>
        ['scene', 'viewport', 'resource', 'export'].includes(reason),
      )
    ) {
      this.#drawScene(stack.scene, scene)
    }
    if (reasons.includes('overlay') || reasons.includes('viewport')) {
      const context = stack.overlay.getContext('2d')!
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, stack.overlay.width, stack.overlay.height)
      drawNodes2D(context, this.#overlay, this.#resourceSources())
    }
    return {
      backend: this.backend,
      correlationId: stack.correlationId,
      reasons: [...reasons],
      nodeCount: scene.nodes.length + this.#overlay.length,
      startedAt,
      duration: this.#now() - startedAt,
    }
  }

  async exportPng(): Promise<Uint8Array> {
    this.#assertReady()
    const scene = this.#scene!
    const target = this.#exportCanvas?.(scene.width, scene.height)
    if (target) {
      this.#drawScene(target, scene)
      if (target.encode) return target.encode('png')
      return this.#blobBytes(target)
    }
    return this.#blobBytes(this.#stack!.scene)
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const resource of this.#resources.values()) resource.dispose()
    this.#resources.clear()
    this.#stack = undefined
    this.#scene = undefined
  }

  #drawScene(canvas: Canvas2DLike, scene: RenderSceneSnapshot): void {
    canvas.width = scene.width
    canvas.height = scene.height
    const context = canvas.getContext('2d')!
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    for (const node of scene.nodes) {
      if (node.kind !== 'image') {
        drawNodes2D(context, [node], this.#resourceSources())
        continue
      }
      if (!node.visible || node.opacity === 0) continue
      const resource = this.#resources.get(node.resourceId)
      context.save()
      context.globalAlpha = node.opacity
      context.globalCompositeOperation = cssBlendMode(node.blendMode)
      context.translate(node.x, node.y)
      context.rotate((node.rotation * Math.PI) / 180)
      context.scale(node.scaleX, node.scaleY)
      if (resource) {
        if ((node.cornerRadius ?? 0) > 0) {
          roundedRectPath(
            context,
            0,
            0,
            node.width,
            node.height,
            node.cornerRadius ?? 0,
          )
          context.clip()
        }
        context.drawImage(resource.source, 0, 0, node.width, node.height)
      } else {
        // A missing blob is a recoverable per-resource failure: preserve the
        // canvas and history while making the affected bounds visible.
        // Match CanvasKit's 0.72/0.28/0.28 placeholder color exactly after
        // its 8-bit conversion, so fallback and headless output stay stable.
        context.fillStyle = 'rgba(184, 71, 71, 0.16)'
        context.strokeStyle = 'rgba(184, 71, 71, 0.9)'
        context.lineWidth = 1
        if ((node.cornerRadius ?? 0) > 0) {
          roundedRectPath(
            context,
            0,
            0,
            node.width,
            node.height,
            node.cornerRadius ?? 0,
          )
          context.fill()
          context.stroke()
        } else {
          context.fillRect(0, 0, node.width, node.height)
          context.strokeRect(0, 0, node.width, node.height)
        }
      }
      if (node.stroke && (node.strokeWidth ?? 0) > 0) {
        context.strokeStyle = cssColor(node.stroke)
        context.lineWidth = node.strokeWidth ?? 1
        context.lineJoin = node.lineJoin ?? 'miter'
        if ((node.cornerRadius ?? 0) > 0) {
          roundedRectPath(
            context,
            0,
            0,
            node.width,
            node.height,
            node.cornerRadius ?? 0,
          )
          context.stroke()
        } else {
          context.strokeRect(0, 0, node.width, node.height)
        }
      }
      context.restore()
    }
  }

  async #blobBytes(canvas: Canvas2DLike): Promise<Uint8Array> {
    if (!canvas.toBlob) throw new Error('Canvas PNG encoding is unavailable')
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob!((value) => {
        if (value) resolve(value)
        else reject(new Error('Canvas PNG encoding failed'))
      }, 'image/png')
    })
    return new Uint8Array(await blob.arrayBuffer())
  }

  #resourceSources(): ReadonlyMap<string, ImageResourceInput['source']> {
    return new Map(
      [...this.#resources.entries()].map(([id, resource]) => [
        id,
        resource.source,
      ]),
    )
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('Canvas2D renderer is disposed')
  }

  #assertReady(): void {
    this.#assertActive()
    if (!this.#stack) throw new Error('Canvas2D renderer is not initialized')
    if (!this.#scene) throw new Error('Canvas2D renderer has no scene')
  }
}
