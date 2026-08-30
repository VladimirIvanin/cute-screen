import type { RenderNode } from '@cute-screen/editor-core'
import type {
  CanvasKitApi,
  CanvasKitCanvas,
  CanvasKitImageResource,
  CanvasKitPaint,
  CanvasKitPath,
  CanvasKitPathEffect,
  CanvasKitShader,
} from './contracts'
import { roundedRectPath, withTransform } from './geometry'
import { configureFillPaint, configureStrokePaint } from './paint'

type Node<K extends RenderNode['kind']> = Extract<RenderNode, { kind: K }>
type Resources = ReadonlyMap<string, CanvasKitImageResource>

interface PaintScope {
  readonly fill: CanvasKitPaint
  readonly stroke: CanvasKitPaint
  setShader(shader: CanvasKitShader | undefined): void
  setPathEffect(effect: CanvasKitPathEffect | undefined): void
}

function withPaints(
  canvasKit: CanvasKitApi,
  draw: (scope: PaintScope) => void,
): void {
  const fill = new canvasKit.Paint()
  const stroke = new canvasKit.Paint()
  let shader: CanvasKitShader | undefined
  let pathEffect: CanvasKitPathEffect | undefined
  try {
    draw({
      fill,
      stroke,
      setShader: (next) => {
        shader = next
      },
      setPathEffect: (next) => {
        pathEffect = next
      },
    })
  } finally {
    fill.delete()
    stroke.delete()
    shader?.delete()
    pathEffect?.delete()
  }
}

export function drawRectNodeCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: Node<'rect'>,
  resources: Resources,
): void {
  withPaints(canvasKit, ({ fill, stroke, setShader, setPathEffect }) => {
    const rect = canvasKit.XYWHRect(node.x, node.y, node.width, node.height)
    const rounded =
      (node.cornerRadius ?? 0) > 0
        ? roundedRectPath(canvasKit, node)
        : undefined
    try {
      withTransform(
        canvas,
        node,
        node.x + node.width / 2,
        node.y + node.height / 2,
        () => {
          setShader(
            configureFillPaint(
              canvasKit,
              fill,
              node.fill,
              node.opacity,
              node.blendMode,
              resources,
            ),
          )
          if (rounded) canvas.drawPath(rounded, fill)
          else canvas.drawRect(rect, fill)
          if (!node.stroke || (node.strokeWidth ?? 0) <= 0) return
          setPathEffect(
            configureStrokePaint(
              canvasKit,
              stroke,
              node,
              node.stroke,
              node.strokeWidth ?? 1,
            ),
          )
          if (rounded) canvas.drawPath(rounded, stroke)
          else canvas.drawRect(rect, stroke)
        },
      )
    } finally {
      rounded?.delete()
    }
  })
}

export function drawEllipseNodeCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: Node<'ellipse'>,
  resources: Resources,
): void {
  withPaints(canvasKit, ({ fill, stroke, setShader, setPathEffect }) => {
    const oval = canvasKit.LTRBRect(
      node.centerX - node.radiusX,
      node.centerY - node.radiusY,
      node.centerX + node.radiusX,
      node.centerY + node.radiusY,
    )
    withTransform(canvas, node, node.centerX, node.centerY, () => {
      setShader(
        configureFillPaint(
          canvasKit,
          fill,
          node.fill,
          node.opacity,
          node.blendMode,
          resources,
        ),
      )
      canvas.drawOval(oval, fill)
      if (!node.stroke || (node.strokeWidth ?? 0) <= 0) return
      setPathEffect(
        configureStrokePaint(
          canvasKit,
          stroke,
          node,
          node.stroke,
          node.strokeWidth ?? 1,
        ),
      )
      canvas.drawOval(oval, stroke)
    })
  })
}

export function drawLineNodeCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: Node<'line'>,
): void {
  withPaints(canvasKit, ({ stroke, setPathEffect }) => {
    withTransform(
      canvas,
      node,
      (node.x1 + node.x2) / 2,
      (node.y1 + node.y2) / 2,
      () => {
        setPathEffect(
          configureStrokePaint(
            canvasKit,
            stroke,
            node,
            node.stroke,
            node.strokeWidth,
          ),
        )
        canvas.drawLine(node.x1, node.y1, node.x2, node.y2, stroke)
      },
    )
  })
}

function buildPointPath(
  canvasKit: CanvasKitApi,
  node: Node<'path' | 'polygon'>,
): CanvasKitPath {
  const builder = new canvasKit.PathBuilder()
  try {
    builder.moveTo(node.points[0]!.x, node.points[0]!.y)
    for (const point of node.points.slice(1)) builder.lineTo(point.x, point.y)
    if (node.kind === 'polygon') builder.close()
    return builder.detach()
  } finally {
    builder.delete()
  }
}

export function drawPathNodeCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: Node<'path'>,
): void {
  const path = buildPointPath(canvasKit, node)
  const xs = node.points.map((point) => point.x)
  const ys = node.points.map((point) => point.y)
  try {
    withPaints(canvasKit, ({ stroke, setPathEffect }) => {
      withTransform(
        canvas,
        node,
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...ys) + Math.max(...ys)) / 2,
        () => {
          setPathEffect(
            configureStrokePaint(
              canvasKit,
              stroke,
              node,
              node.stroke,
              node.strokeWidth,
            ),
          )
          canvas.drawPath(path, stroke)
        },
      )
    })
  } finally {
    path.delete()
  }
}

export function drawPolygonNodeCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: Node<'polygon'>,
  resources: Resources,
): void {
  const path = buildPointPath(canvasKit, node)
  const centerX =
    node.points.reduce((sum, point) => sum + point.x, 0) / node.points.length
  const centerY =
    node.points.reduce((sum, point) => sum + point.y, 0) / node.points.length
  try {
    withPaints(canvasKit, ({ fill, stroke, setShader, setPathEffect }) => {
      withTransform(canvas, node, centerX, centerY, () => {
        setShader(
          configureFillPaint(
            canvasKit,
            fill,
            node.fill,
            node.opacity,
            node.blendMode,
            resources,
          ),
        )
        canvas.drawPath(path, fill)
        if (!node.stroke || (node.strokeWidth ?? 0) <= 0) return
        setPathEffect(
          configureStrokePaint(
            canvasKit,
            stroke,
            node,
            node.stroke,
            node.strokeWidth ?? 1,
          ),
        )
        canvas.drawPath(path, stroke)
      })
    })
  } finally {
    path.delete()
  }
}
