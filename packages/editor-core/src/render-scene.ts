export interface RgbaColor {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}

export interface RenderGradientStop {
  readonly position: number
  readonly color: RgbaColor
}

/** Renderer-neutral paints deliberately carry resolved canvas-space geometry. */
export type RenderPaint =
  | RgbaColor
  | Readonly<{
      readonly kind: 'linearGradient'
      readonly startX: number
      readonly startY: number
      readonly endX: number
      readonly endY: number
      readonly stops: readonly RenderGradientStop[]
    }>
  | Readonly<{
      readonly kind: 'radialGradient'
      readonly centerX: number
      readonly centerY: number
      readonly radius: number
      readonly stops: readonly RenderGradientStop[]
    }>
  | Readonly<{
      readonly kind: 'imageTexture'
      readonly resourceId: string
      readonly opacity: number
      readonly scale: number
      readonly rotation: number
      readonly offsetX: number
      readonly offsetY: number
    }>

export type RenderBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'softLight'
  | 'hardLight'

export type RenderLineCap = 'butt' | 'round' | 'square'
export type RenderLineJoin = 'miter' | 'round' | 'bevel'

interface RenderNodeBase {
  readonly id: string
  readonly rotation: number
  /** Optional layer-space scale. When present, rotation and scale share this origin. */
  readonly scaleX?: number
  readonly scaleY?: number
  readonly transformOriginX?: number
  readonly transformOriginY?: number
  readonly opacity: number
  readonly visible: boolean
  readonly blendMode?: RenderBlendMode
}

export interface RenderRectNode extends RenderNodeBase {
  readonly kind: 'rect'
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly cornerRadius?: number
  readonly fill: RenderPaint
  readonly stroke?: RgbaColor
  readonly strokeWidth?: number
  readonly lineJoin?: RenderLineJoin
}

export interface RenderEllipseNode extends RenderNodeBase {
  readonly kind: 'ellipse'
  readonly centerX: number
  readonly centerY: number
  readonly radiusX: number
  readonly radiusY: number
  readonly fill: RenderPaint
  readonly stroke?: RgbaColor
  readonly strokeWidth?: number
  readonly lineJoin?: RenderLineJoin
}

export interface RenderLineNode extends RenderNodeBase {
  readonly kind: 'line'
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly stroke: RgbaColor
  readonly strokeWidth: number
  readonly lineCap?: RenderLineCap
  readonly lineJoin?: RenderLineJoin
  readonly dash?: readonly number[]
}

/** A single stroked contour. Freehand tools must not be decomposed into lines,
 * otherwise their blend mode and joins are applied once per input segment. */
export interface RenderPathNode extends RenderNodeBase {
  readonly kind: 'path'
  readonly points: readonly Readonly<{
    readonly x: number
    readonly y: number
  }>[]
  readonly stroke: RgbaColor
  readonly strokeWidth: number
  readonly lineCap?: RenderLineCap
  readonly lineJoin?: RenderLineJoin
  readonly dash?: readonly number[]
}

export interface RenderPolygonNode extends RenderNodeBase {
  readonly kind: 'polygon'
  readonly points: readonly Readonly<{
    readonly x: number
    readonly y: number
  }>[]
  readonly fill: RenderPaint
  readonly stroke?: RgbaColor
  readonly strokeWidth?: number
  readonly lineJoin?: RenderLineJoin
}

/** Raster layers share the ordered scene graph with annotation nodes. */
export interface RenderImageNode extends RenderNodeBase {
  readonly kind: 'image'
  readonly resourceId: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly scaleX: number
  readonly scaleY: number
  readonly cornerRadius?: number
  readonly stroke?: RgbaColor
  readonly strokeWidth?: number
  readonly lineJoin?: RenderLineJoin
}

export interface RenderTextStyle {
  readonly fontFamily: string
  readonly fontSize: number
  readonly color: RgbaColor
  readonly fontWeight: number
  readonly fontStyle: 'normal' | 'italic'
  readonly strikethrough: boolean
}

export interface RenderTextRun extends RenderTextStyle {
  /** UTF-16 offsets into RenderTextNode.text. */
  readonly start: number
  readonly end: number
}

export interface RenderTextParagraph {
  /** UTF-16 offsets into RenderTextNode.text. */
  readonly start: number
  readonly end: number
  readonly alignment: 'start' | 'center' | 'end'
  readonly listKind: 'none' | 'bullet'
}

/** Text stays a first-class scene node so preview and export share rich layout input. */
export interface RenderTextNode extends RenderNodeBase {
  readonly kind: 'text'
  readonly text: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly wrap: 'autoSize' | 'fixedWidth'
  readonly fixedWidth?: number
  readonly runs: readonly RenderTextRun[]
  readonly paragraphs: readonly RenderTextParagraph[]
  /** Optional optical alignment for compact labels such as numbered markers. */
  readonly verticalAlign?: 'visualCenter'
}

export type RenderNode =
  | RenderRectNode
  | RenderEllipseNode
  | RenderLineNode
  | RenderPathNode
  | RenderPolygonNode
  | RenderImageNode
  | RenderTextNode

export interface RenderSceneSnapshot {
  readonly width: number
  readonly height: number
  readonly nodes: readonly RenderNode[]
}

export type RenderSceneInput = Omit<RenderSceneSnapshot, 'nodes'> & {
  readonly nodes: readonly RenderNode[]
}

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${field} must be finite`)
}

function assertPositive(value: number, field: string): void {
  assertFinite(value, field)
  if (value <= 0) throw new RangeError(`${field} must be positive`)
}

function assertNonNegative(value: number, field: string): void {
  assertFinite(value, field)
  if (value < 0) throw new RangeError(`${field} must be non-negative`)
}

function freezeColor(color: RgbaColor): RgbaColor {
  const channels = [
    ['red', color.red],
    ['green', color.green],
    ['blue', color.blue],
    ['alpha', color.alpha],
  ] as const
  for (const [channel, value] of channels) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${channel} color channel must be between 0 and 1`)
    }
  }
  return Object.freeze({ ...color })
}

function isSolidPaint(paint: RenderPaint): paint is RgbaColor {
  return !('kind' in paint)
}

function freezePaint(paint: RenderPaint, field: string): RenderPaint {
  if (isSolidPaint(paint)) return freezeColor(paint)
  if (paint.kind === 'imageTexture') {
    if (!paint.resourceId) throw new RangeError(`${field}.resourceId is empty`)
    for (const [name, value] of Object.entries({
      opacity: paint.opacity,
      scale: paint.scale,
      rotation: paint.rotation,
      offsetX: paint.offsetX,
      offsetY: paint.offsetY,
    })) {
      assertFinite(value, `${field}.${name}`)
    }
    if (paint.opacity < 0 || paint.opacity > 1 || paint.scale <= 0) {
      throw new RangeError(`${field} image texture values are invalid`)
    }
    return Object.freeze({ ...paint })
  }
  if (paint.kind === 'linearGradient') {
    for (const [name, value] of Object.entries({
      startX: paint.startX,
      startY: paint.startY,
      endX: paint.endX,
      endY: paint.endY,
    })) {
      assertFinite(value, `${field}.${name}`)
    }
  } else {
    assertFinite(paint.centerX, `${field}.centerX`)
    assertFinite(paint.centerY, `${field}.centerY`)
    assertPositive(paint.radius, `${field}.radius`)
  }
  if (paint.stops.length < 2 || paint.stops.length > 8) {
    throw new RangeError(`${field}.stops must contain 2 to 8 entries`)
  }
  let previous = -1
  const stops = paint.stops.map((stop, index) => {
    if (
      !Number.isFinite(stop.position) ||
      stop.position < 0 ||
      stop.position > 1 ||
      stop.position < previous
    ) {
      throw new RangeError(`${field}.stops[${index}].position is invalid`)
    }
    previous = stop.position
    return Object.freeze({
      position: stop.position,
      color: freezeColor(stop.color),
    })
  })
  return Object.freeze({ ...paint, stops: Object.freeze(stops) })
}

function validateStrokeStyle(node: RenderLineNode | RenderPathNode): void {
  if (node.lineCap && !['butt', 'round', 'square'].includes(node.lineCap))
    throw new RangeError(`${node.id}.lineCap is invalid`)
  if (node.lineJoin && !['miter', 'round', 'bevel'].includes(node.lineJoin))
    throw new RangeError(`${node.id}.lineJoin is invalid`)
  if (node.dash) {
    if (
      node.dash.length === 0 ||
      node.dash.some((value) => !Number.isFinite(value) || value <= 0)
    ) {
      throw new RangeError(`${node.id}.dash is invalid`)
    }
  }
}

function assertNodeBase(node: RenderNode): void {
  if (!node.id) throw new Error('Render node id must not be empty')
  assertFinite(node.rotation, `${node.id}.rotation`)
  if (node.scaleX !== undefined) assertFinite(node.scaleX, `${node.id}.scaleX`)
  if (node.scaleY !== undefined) assertFinite(node.scaleY, `${node.id}.scaleY`)
  if (node.scaleX === 0 || node.scaleY === 0) {
    throw new RangeError(`Render node ${node.id} scale must not be zero`)
  }
  if (
    (node.transformOriginX === undefined) !==
    (node.transformOriginY === undefined)
  ) {
    throw new RangeError(
      `Render node ${node.id} transform origin must contain both coordinates`,
    )
  }
  if (node.transformOriginX !== undefined) {
    assertFinite(node.transformOriginX, `${node.id}.transformOriginX`)
    assertFinite(node.transformOriginY!, `${node.id}.transformOriginY`)
  }
  if (!Number.isFinite(node.opacity) || node.opacity < 0 || node.opacity > 1) {
    throw new RangeError(
      `Render node ${node.id} opacity must be between 0 and 1`,
    )
  }
}

function freezeRectNode(node: RenderRectNode): RenderRectNode {
  assertFinite(node.x, `${node.id}.x`)
  assertFinite(node.y, `${node.id}.y`)
  assertPositive(node.width, `${node.id}.width`)
  assertPositive(node.height, `${node.id}.height`)
  if (node.cornerRadius !== undefined) {
    assertNonNegative(node.cornerRadius, `${node.id}.cornerRadius`)
    if (node.cornerRadius > Math.min(node.width, node.height) / 2) {
      throw new RangeError(`${node.id}.cornerRadius exceeds its bounds`)
    }
  }
  if (node.strokeWidth !== undefined) {
    assertNonNegative(node.strokeWidth, `${node.id}.strokeWidth`)
  }
  return Object.freeze({
    ...node,
    fill: freezePaint(node.fill, `${node.id}.fill`),
    ...(node.stroke === undefined ? {} : { stroke: freezeColor(node.stroke) }),
  })
}

function freezeEllipseNode(node: RenderEllipseNode): RenderEllipseNode {
  assertFinite(node.centerX, `${node.id}.centerX`)
  assertFinite(node.centerY, `${node.id}.centerY`)
  assertPositive(node.radiusX, `${node.id}.radiusX`)
  assertPositive(node.radiusY, `${node.id}.radiusY`)
  if (node.strokeWidth !== undefined) {
    assertNonNegative(node.strokeWidth, `${node.id}.strokeWidth`)
  }
  return Object.freeze({
    ...node,
    fill: freezePaint(node.fill, `${node.id}.fill`),
    ...(node.stroke === undefined ? {} : { stroke: freezeColor(node.stroke) }),
  })
}

function freezeLineNode(node: RenderLineNode): RenderLineNode {
  assertFinite(node.x1, `${node.id}.x1`)
  assertFinite(node.y1, `${node.id}.y1`)
  assertFinite(node.x2, `${node.id}.x2`)
  assertFinite(node.y2, `${node.id}.y2`)
  assertPositive(node.strokeWidth, `${node.id}.strokeWidth`)
  validateStrokeStyle(node)
  return Object.freeze({ ...node, stroke: freezeColor(node.stroke) })
}

function freezePathNode(node: RenderPathNode): RenderPathNode {
  if (node.points.length < 2)
    throw new RangeError(`${node.id}.points must contain at least 2 entries`)
  assertPositive(node.strokeWidth, `${node.id}.strokeWidth`)
  validateStrokeStyle(node)
  const points = node.points.map((point, index) => {
    assertFinite(point.x, `${node.id}.points[${index}].x`)
    assertFinite(point.y, `${node.id}.points[${index}].y`)
    return Object.freeze({ x: point.x, y: point.y })
  })
  return Object.freeze({
    ...node,
    points: Object.freeze(points),
    stroke: freezeColor(node.stroke),
  })
}

function freezePolygonNode(node: RenderPolygonNode): RenderPolygonNode {
  if (node.points.length < 3)
    throw new RangeError(`${node.id}.points must contain at least 3 entries`)
  if (node.strokeWidth !== undefined)
    assertNonNegative(node.strokeWidth, `${node.id}.strokeWidth`)
  const points = node.points.map((point, index) => {
    assertFinite(point.x, `${node.id}.points[${index}].x`)
    assertFinite(point.y, `${node.id}.points[${index}].y`)
    return Object.freeze({ x: point.x, y: point.y })
  })
  return Object.freeze({
    ...node,
    points: Object.freeze(points),
    fill: freezePaint(node.fill, `${node.id}.fill`),
    ...(node.stroke === undefined ? {} : { stroke: freezeColor(node.stroke) }),
  })
}

function freezeImageNode(node: RenderImageNode): RenderImageNode {
  if (!node.resourceId)
    throw new Error(`${node.id}.resourceId must not be empty`)
  assertFinite(node.x, `${node.id}.x`)
  assertFinite(node.y, `${node.id}.y`)
  assertPositive(node.width, `${node.id}.width`)
  assertPositive(node.height, `${node.id}.height`)
  if (!Number.isFinite(node.scaleX) || node.scaleX === 0) {
    throw new RangeError(`${node.id}.scaleX must be finite and non-zero`)
  }
  if (!Number.isFinite(node.scaleY) || node.scaleY === 0) {
    throw new RangeError(`${node.id}.scaleY must be finite and non-zero`)
  }
  if (node.cornerRadius !== undefined) {
    assertNonNegative(node.cornerRadius, `${node.id}.cornerRadius`)
    if (node.cornerRadius > Math.min(node.width, node.height) / 2) {
      throw new RangeError(`${node.id}.cornerRadius exceeds its bounds`)
    }
  }
  if (node.strokeWidth !== undefined) {
    assertNonNegative(node.strokeWidth, `${node.id}.strokeWidth`)
  }
  if (
    node.lineJoin !== undefined &&
    !['miter', 'round', 'bevel'].includes(node.lineJoin)
  ) {
    throw new RangeError(`${node.id}.lineJoin is invalid`)
  }
  return Object.freeze({
    ...node,
    ...(node.stroke === undefined ? {} : { stroke: freezeColor(node.stroke) }),
  })
}

function freezeTextNode(node: RenderTextNode): RenderTextNode {
  assertFinite(node.x, `${node.id}.x`)
  assertFinite(node.y, `${node.id}.y`)
  for (const [field, value] of Object.entries({
    width: node.width,
    height: node.height,
  }))
    assertPositive(value, `${node.id}.${field}`)
  if (node.wrap !== 'autoSize' && node.wrap !== 'fixedWidth') {
    throw new RangeError(`${node.id}.wrap is invalid`)
  }
  if (node.wrap === 'fixedWidth') {
    if (node.fixedWidth === undefined) {
      throw new RangeError(`${node.id}.fixedWidth is required`)
    }
    assertPositive(node.fixedWidth, `${node.id}.fixedWidth`)
  } else if (node.fixedWidth !== undefined) {
    throw new RangeError(
      `${node.id}.fixedWidth is only valid for fixedWidth text`,
    )
  }
  const isBoundary = (offset: number): boolean => {
    if (!Number.isInteger(offset) || offset < 0 || offset > node.text.length)
      return false
    if (offset === 0 || offset === node.text.length) return true
    const previous = node.text.charCodeAt(offset - 1)
    const next = node.text.charCodeAt(offset)
    return !(
      previous >= 0xd800 &&
      previous <= 0xdbff &&
      next >= 0xdc00 &&
      next <= 0xdfff
    )
  }
  let runEnd = 0
  const runs = node.runs.map((run, index) => {
    if (
      run.start !== runEnd ||
      run.end <= run.start ||
      !isBoundary(run.start) ||
      !isBoundary(run.end)
    ) {
      throw new RangeError(
        `${node.id}.runs[${index}] must be contiguous UTF-16 ranges`,
      )
    }
    runEnd = run.end
    if (!run.fontFamily)
      throw new Error(`${node.id}.runs[${index}].fontFamily is empty`)
    assertPositive(run.fontSize, `${node.id}.runs[${index}].fontSize`)
    if (
      !Number.isInteger(run.fontWeight) ||
      run.fontWeight < 100 ||
      run.fontWeight > 900 ||
      run.fontWeight % 100 !== 0
    ) {
      throw new RangeError(`${node.id}.runs[${index}].fontWeight is invalid`)
    }
    if (!['normal', 'italic'].includes(run.fontStyle)) {
      throw new RangeError(`${node.id}.runs[${index}].fontStyle is invalid`)
    }
    return Object.freeze({ ...run, color: freezeColor(run.color) })
  })
  let paragraphEnd = 0
  const paragraphs = node.paragraphs.map((paragraph, index) => {
    const terminalEmpty =
      index === node.paragraphs.length - 1 &&
      paragraph.start === node.text.length &&
      paragraph.end === node.text.length &&
      node.text.endsWith('\n')
    if (
      paragraph.start !== paragraphEnd ||
      (paragraph.end <= paragraph.start && !terminalEmpty) ||
      !isBoundary(paragraph.start) ||
      !isBoundary(paragraph.end)
    ) {
      throw new RangeError(
        `${node.id}.paragraphs[${index}] must be contiguous UTF-16 ranges`,
      )
    }
    paragraphEnd = paragraph.end
    if (!['start', 'center', 'end'].includes(paragraph.alignment)) {
      throw new RangeError(
        `${node.id}.paragraphs[${index}].alignment is invalid`,
      )
    }
    if (paragraph.listKind !== 'none' && paragraph.listKind !== 'bullet') {
      throw new RangeError(
        `${node.id}.paragraphs[${index}].listKind is invalid`,
      )
    }
    return Object.freeze({ ...paragraph })
  })
  if (
    (node.text.length === 0 &&
      (runs.length !== 0 || paragraphs.length !== 0)) ||
    (node.text.length > 0 &&
      (runs.length === 0 ||
        paragraphs.length === 0 ||
        runEnd !== node.text.length ||
        paragraphEnd !== node.text.length))
  ) {
    throw new RangeError(`${node.id} rich text ranges must cover text exactly`)
  }
  return Object.freeze({
    ...node,
    runs: Object.freeze(runs),
    paragraphs: Object.freeze(paragraphs),
  })
}

function assertNever(value: never): never {
  throw new Error(`unsupported render node: ${String(value)}`)
}

function freezeNode(node: RenderNode): RenderNode {
  assertNodeBase(node)
  switch (node.kind) {
    case 'rect':
      return freezeRectNode(node)
    case 'ellipse':
      return freezeEllipseNode(node)
    case 'line':
      return freezeLineNode(node)
    case 'path':
      return freezePathNode(node)
    case 'polygon':
      return freezePolygonNode(node)
    case 'image':
      return freezeImageNode(node)
    case 'text':
      return freezeTextNode(node)
    default:
      return assertNever(node)
  }
}

export function createRenderSceneSnapshot(
  input: RenderSceneInput,
): RenderSceneSnapshot {
  assertPositive(input.width, 'width')
  assertPositive(input.height, 'height')
  const ids = new Set<string>()
  const nodes = input.nodes.map((node) => {
    if (ids.has(node.id))
      throw new Error(`Duplicate render node id: ${node.id}`)
    ids.add(node.id)
    return freezeNode(node)
  })
  return Object.freeze({
    width: input.width,
    height: input.height,
    nodes: Object.freeze(nodes),
  })
}

/** Compile-time marker for the DOM-free editor package boundary. */
export type EditorCoreBoundary = Readonly<{
  package: 'editor-core'
}>
