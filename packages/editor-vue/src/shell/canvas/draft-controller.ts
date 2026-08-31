import {
  calloutMarkerRadius,
  calloutPathPoints,
  createCensorLayer,
  createDocumentRenderScene,
  createDrawingLayer,
  createLoupeLayer,
  createRulerLayer,
  createSpotlightLayer,
  defaultCalloutRoute,
  drawNodes2D,
  type LayerNode,
  type RulerAngleGuide,
  type StrokeStyle,
} from '@cute-screen/editor-renderer'
import type { CanvasPoint, CanvasViewportProps } from './contracts'
import {
  DEFAULT_CALLOUT_STROKE,
  DEFAULT_PRECISION_TOOLS,
  type CanvasGesture,
  type createCanvasWorkspaceState,
} from './workspace-state'

type EditingText = ReturnType<typeof createCanvasWorkspaceState>['editingText']

export interface DraftControllerContext {
  readonly props: CanvasViewportProps
  readonly editingText: EditingText
  readonly gesture: () => CanvasGesture
  readonly rulerGuide: () => RulerAngleGuide | undefined
}

function rectFromPoints(start: CanvasPoint, end: CanvasPoint) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

function freeformDraftPoints(
  points: readonly CanvasPoint[],
  start: CanvasPoint,
  end: CanvasPoint,
): readonly CanvasPoint[] {
  if (points.length >= 3) {
    const area = points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length]!
      return sum + point.x * next.y - next.x * point.y
    }, 0)
    if (Math.abs(area) > 0.5) return points
  }
  const bounds = rectFromPoints(start, end)
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ]
}

export class DraftController {
  readonly #context: DraftControllerContext

  constructor(context: DraftControllerContext) {
    this.#context = context
  }

  resolveCalloutStroke(): StrokeStyle {
    const arrowStroke = this.#context.props.drawingDefaults?.arrow?.stroke
    if (arrowStroke && typeof arrowStroke === 'object') {
      return arrowStroke as StrokeStyle
    }
    return DEFAULT_CALLOUT_STROKE
  }

  drawDrawing(context: CanvasRenderingContext2D): void {
    const { props } = this.#context
    const gesture = this.#context.gesture()
    if (!gesture || gesture.kind !== 'draw') return
    const layer = createDrawingLayer({
      id: '__drawing-draft__',
      tool: gesture.tool,
      start: gesture.start,
      end: gesture.current,
      ...(props.drawingDefaults === undefined
        ? {}
        : { defaults: props.drawingDefaults }),
      constrainAngle: gesture.constrainAngle,
      drawFromCenter: gesture.drawFromCenter,
      points: gesture.points,
    })
    if (!layer || !props.document) return
    drawNodes2D(
      context,
      createDocumentRenderScene({ ...props.document, layers: [layer] }).nodes,
    )
  }

  drawCallout(context: CanvasRenderingContext2D): void {
    const { editingText } = this.#context
    const gesture = this.#context.gesture()
    let target: CanvasPoint | undefined
    let label: CanvasPoint | undefined
    let stroke = this.resolveCalloutStroke()
    if (gesture?.kind === 'calloutDraw') {
      target = gesture.start
      label = gesture.current
    } else {
      const editing = editingText.value
      if (
        editing?.kind !== 'callout' ||
        editing.existing ||
        !editing.calloutDraft
      ) {
        return
      }
      target = editing.calloutDraft.target
      label = editing.calloutDraft.label
      stroke = editing.calloutStroke ?? stroke
    }
    if (!target || !label || (target.x === label.x && target.y === label.y)) {
      return
    }
    const points = calloutPathPoints({
      target,
      label,
      route: defaultCalloutRoute(target, label),
      stroke,
      content: { text: '', wrap: 'autoSize', spans: [], paragraphs: [] },
      background: null,
      targetMarker: 'circle',
      labelMarker: 'circle',
    })
    this.#strokeCallout(context, points, stroke)
  }

  precisionLayer(id = '__precision-draft__'): LayerNode | undefined {
    const { props } = this.#context
    const gesture = this.#context.gesture()
    if (!gesture || gesture.kind !== 'precision') return undefined
    const defaults = props.precisionDefaults ?? DEFAULT_PRECISION_TOOLS
    const bounds = rectFromPoints(gesture.start, gesture.current)
    if (gesture.tool === 'censor') {
      if (bounds.width < 1 || bounds.height < 1) return undefined
      const effect =
        defaults.censor.mode === 'pixelate'
          ? ({
              mode: 'pixelate',
              blockSize: defaults.censor.blockSize,
            } as const)
          : defaults.censor.mode === 'blur'
            ? ({
                mode: 'blur',
                strength: defaults.censor.blurStrength,
              } as const)
            : ({ mode: 'solid', color: defaults.censor.solidColor } as const)
      return createCensorLayer({
        id,
        region:
          defaults.censor.region === 'freeform'
            ? {
                kind: 'freeform',
                points: freeformDraftPoints(
                  gesture.points,
                  gesture.start,
                  gesture.current,
                ),
              }
            : { kind: 'rectangle', bounds },
        effect,
      })
    }
    if (gesture.tool === 'spotlight') {
      if (bounds.width < 1 || bounds.height < 1) return undefined
      return createSpotlightLayer({
        id,
        bounds,
        shape: defaults.spotlight.shape,
        dimColor: defaults.spotlight.dimColor,
        dimOpacity: defaults.spotlight.dimOpacity,
        feather: defaults.spotlight.feather,
      })
    }
    if (gesture.tool === 'ruler') {
      return this.#rulerLayer(id, gesture, defaults)
    }
    return this.#loupeLayer(id, gesture, defaults)
  }

  drawPrecision(context: CanvasRenderingContext2D): void {
    const { props } = this.#context
    const gesture = this.#context.gesture()
    if (!gesture || gesture.kind !== 'precision') return
    const defaults = props.precisionDefaults ?? DEFAULT_PRECISION_TOOLS
    const bounds = rectFromPoints(gesture.start, gesture.current)
    const scale = (props.zoom ?? 100) / 100
    context.save()
    context.strokeStyle = '#d9773b'
    context.fillStyle = 'rgba(217, 119, 59, 0.14)'
    context.lineWidth = 2 / scale
    context.setLineDash([5 / scale, 3 / scale])
    context.beginPath()
    this.#tracePrecisionPath(context, gesture, defaults, bounds)
    context.fill()
    context.stroke()
    context.restore()
    this.#drawRulerGuide(context)
  }

  #tracePrecisionPath(
    context: CanvasRenderingContext2D,
    gesture: Extract<
      NonNullable<CanvasGesture>,
      { readonly kind: 'precision' }
    >,
    defaults: typeof DEFAULT_PRECISION_TOOLS,
    bounds: { x: number; y: number; width: number; height: number },
  ): void {
    switch (gesture.tool) {
      case 'censor':
        if (defaults.censor.region === 'freeform') {
          this.#freeformPath(context, gesture)
          return
        }
        break
      case 'ruler':
        context.moveTo(gesture.start.x, gesture.start.y)
        context.lineTo(gesture.current.x, gesture.current.y)
        return
      case 'loupe':
        this.#loupePath(context, gesture, defaults)
        return
      case 'spotlight':
        if (defaults.spotlight.shape === 'ellipse') {
          context.ellipse(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
            bounds.width / 2,
            bounds.height / 2,
            0,
            0,
            Math.PI * 2,
          )
          return
        }
        if (defaults.spotlight.shape === 'diamond') {
          this.#diamondPath(context, bounds)
          return
        }
        break
    }
    context.rect(bounds.x, bounds.y, bounds.width, bounds.height)
  }

  #strokeCallout(
    context: CanvasRenderingContext2D,
    points: readonly CanvasPoint[],
    stroke: StrokeStyle,
  ): void {
    const scale = 1 / ((this.#context.props.zoom ?? 100) / 100)
    context.save()
    context.strokeStyle = `rgba(${Math.round(stroke.color.red * 255)}, ${Math.round(stroke.color.green * 255)}, ${Math.round(stroke.color.blue * 255)}, ${stroke.color.alpha})`
    context.lineWidth = stroke.width * scale
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    context.moveTo(points[0]!.x, points[0]!.y)
    for (const point of points.slice(1)) context.lineTo(point.x, point.y)
    context.stroke()
    context.fillStyle = context.strokeStyle
    const radius = calloutMarkerRadius(stroke.width)
    for (const point of [points[0]!, points[points.length - 1]!]) {
      context.beginPath()
      context.arc(point.x, point.y, radius, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  #rulerLayer(
    id: string,
    gesture: Extract<
      NonNullable<CanvasGesture>,
      { readonly kind: 'precision' }
    >,
    defaults: typeof DEFAULT_PRECISION_TOOLS,
  ): LayerNode | undefined {
    const canvas = this.#context.props.canvas
    if (
      !canvas ||
      (gesture.start.x === gesture.current.x &&
        gesture.start.y === gesture.current.y)
    ) {
      return undefined
    }
    return createRulerLayer({
      id,
      canvas,
      start: gesture.start,
      end: gesture.current,
      unit: defaults.ruler.unit,
      snapAngleIncrementDegrees: defaults.ruler.snapAngleIncrementDegrees,
      color: defaults.ruler.color,
      thickness: defaults.ruler.thickness,
      fontSize: defaults.ruler.fontSize,
    })
  }

  #loupeLayer(
    id: string,
    gesture: Extract<
      NonNullable<CanvasGesture>,
      { readonly kind: 'precision' }
    >,
    defaults: typeof DEFAULT_PRECISION_TOOLS,
  ): LayerNode | undefined {
    const canvas = this.#context.props.canvas
    if (!canvas) return undefined
    const zoom = defaults.loupe.zoom
    const size = Math.min(
      defaults.loupe.size,
      Math.min(canvas.width, canvas.height) * zoom,
    )
    const sourceSize = size / zoom
    const sourceX = Math.max(
      0,
      Math.min(canvas.width - sourceSize, gesture.start.x - sourceSize / 2),
    )
    const sourceY = Math.max(
      0,
      Math.min(canvas.height - sourceSize, gesture.start.y - sourceSize / 2),
    )
    return createLoupeLayer({
      id,
      canvas,
      sourceRegion: {
        x: sourceX,
        y: sourceY,
        width: sourceSize,
        height: sourceSize,
      },
      destination: {
        x: gesture.current.x - size / 2,
        y: gesture.current.y - size / 2,
      },
      zoom,
      size,
      shape: defaults.loupe.shape,
      borderColor: defaults.loupe.borderColor,
      borderWidth: defaults.loupe.borderWidth,
      shadow: defaults.loupe.shadow
        ? {
            color: { red: 0, green: 0, blue: 0, alpha: 0.35 },
            offsetX: 0,
            offsetY: 6,
            blur: 14,
          }
        : null,
    })
  }

  #freeformPath(
    context: CanvasRenderingContext2D,
    gesture: Extract<
      NonNullable<CanvasGesture>,
      { readonly kind: 'precision' }
    >,
  ): void {
    const points = freeformDraftPoints(
      gesture.points,
      gesture.start,
      gesture.current,
    )
    const first = points[0]
    if (!first) return
    context.moveTo(first.x, first.y)
    for (const point of points.slice(1)) context.lineTo(point.x, point.y)
    context.closePath()
  }

  #loupePath(
    context: CanvasRenderingContext2D,
    gesture: Extract<
      NonNullable<CanvasGesture>,
      { readonly kind: 'precision' }
    >,
    defaults: typeof DEFAULT_PRECISION_TOOLS,
  ): void {
    const sourceSize = defaults.loupe.size / defaults.loupe.zoom
    context.moveTo(gesture.current.x, gesture.current.y)
    context.lineTo(gesture.start.x, gesture.start.y)
    context.rect(
      gesture.start.x - sourceSize / 2,
      gesture.start.y - sourceSize / 2,
      sourceSize,
      sourceSize,
    )
    if (defaults.loupe.shape === 'circle') {
      context.moveTo(
        gesture.current.x + defaults.loupe.size / 2,
        gesture.current.y,
      )
      context.arc(
        gesture.current.x,
        gesture.current.y,
        defaults.loupe.size / 2,
        0,
        Math.PI * 2,
      )
    } else {
      context.rect(
        gesture.current.x - defaults.loupe.size / 2,
        gesture.current.y - defaults.loupe.size / 2,
        defaults.loupe.size,
        defaults.loupe.size,
      )
    }
  }

  #diamondPath(
    context: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
  ): void {
    context.moveTo(bounds.x + bounds.width / 2, bounds.y)
    context.lineTo(bounds.x + bounds.width, bounds.y + bounds.height / 2)
    context.lineTo(bounds.x + bounds.width / 2, bounds.y + bounds.height)
    context.lineTo(bounds.x, bounds.y + bounds.height / 2)
    context.closePath()
  }

  #drawRulerGuide(context: CanvasRenderingContext2D): void {
    const guide = this.#context.rulerGuide()
    if (!guide) return
    context.save()
    context.strokeStyle = '#d9773b'
    context.lineWidth = 1 / ((this.#context.props.zoom ?? 100) / 100)
    context.setLineDash([4, 3])
    context.beginPath()
    context.moveTo(guide.start.x, guide.start.y)
    context.lineTo(guide.end.x, guide.end.y)
    context.stroke()
    context.restore()
  }
}
