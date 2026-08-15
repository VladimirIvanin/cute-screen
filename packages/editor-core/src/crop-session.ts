import type { EditorCommand } from './commands/types'
import type { EditorDocument, Point, Rect } from './document/types'

export const CROP_PRESETS = ['free', '1:1', '4:3', '16:9', 'original'] as const

export type CropPreset = (typeof CROP_PRESETS)[number]

export const CROP_RESIZE_HANDLES = [
  'north',
  'northEast',
  'east',
  'southEast',
  'south',
  'southWest',
  'west',
  'northWest',
] as const

export type CropResizeHandle = (typeof CROP_RESIZE_HANDLES)[number]
export type CropNudgeDirection = 'up' | 'right' | 'down' | 'left'

export interface CropSessionOptions {
  /** Minimum free-crop width and height in canvas units. Defaults to one. */
  readonly minimumSize?: number
}

export interface CropSession {
  /** Snapshot of the authoritative document canvas at session open. */
  readonly canvas: Readonly<{ width: number; height: number }>
  /** The canvas ratio at session open; base-layer/source bounds are irrelevant. */
  readonly originalAspectRatio: number
  /** Committed value used as the `setCrop.before` concurrency guard. */
  readonly initialCrop: Rect | null
  /** Transient draft. A full-canvas draft is canonicalized to null on apply. */
  readonly crop: Rect
  readonly preset: CropPreset
  readonly minimumSize: number
}

const DEFAULT_MINIMUM_SIZE = 1

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${field} must be finite`)
}

function assertCanvas(
  canvas: Readonly<{ width: number; height: number }>,
): void {
  assertFinite(canvas.width, 'canvas.width')
  assertFinite(canvas.height, 'canvas.height')
  if (canvas.width <= 0 || canvas.height <= 0) {
    throw new RangeError('canvas dimensions must be positive')
  }
}

function assertMinimumSize(value: number): void {
  assertFinite(value, 'minimumSize')
  if (value <= 0) throw new RangeError('minimumSize must be positive')
}

function assertDelta(delta: Point): void {
  assertFinite(delta.x, 'delta.x')
  assertFinite(delta.y, 'delta.y')
}

function assertPreset(preset: CropPreset): void {
  if (!(CROP_PRESETS as readonly string[]).includes(preset)) {
    throw new RangeError(`unsupported crop preset: ${String(preset)}`)
  }
}

function assertResizeHandle(handle: CropResizeHandle): void {
  if (!(CROP_RESIZE_HANDLES as readonly string[]).includes(handle)) {
    throw new RangeError(`unsupported crop resize handle: ${String(handle)}`)
  }
}

function assertCropInsideCanvas(
  crop: Rect,
  canvas: Readonly<{ width: number; height: number }>,
): void {
  for (const field of ['x', 'y', 'width', 'height'] as const) {
    assertFinite(crop[field], `crop.${field}`)
  }
  if (
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.x + crop.width > canvas.width ||
    crop.y + crop.height > canvas.height
  ) {
    throw new RangeError('crop must remain inside canvas')
  }
}

function freezeRect(rect: Rect): Rect {
  return Object.freeze({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  })
}

function freezeSession(session: CropSession): CropSession {
  return Object.freeze({
    canvas: Object.freeze({ ...session.canvas }),
    originalAspectRatio: session.originalAspectRatio,
    initialCrop:
      session.initialCrop === null ? null : freezeRect(session.initialCrop),
    crop: freezeRect(session.crop),
    preset: session.preset,
    minimumSize: session.minimumSize,
  })
}

function updateSession(
  session: CropSession,
  crop: Rect,
  preset = session.preset,
): CropSession {
  assertCropInsideCanvas(crop, session.canvas)
  return freezeSession({ ...session, crop, preset })
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function ratioForPreset(
  session: CropSession,
  preset = session.preset,
): number | null {
  assertPreset(preset)
  switch (preset) {
    case 'free':
      return null
    case '1:1':
      return 1
    case '4:3':
      return 4 / 3
    case '16:9':
      return 16 / 9
    case 'original':
      return session.originalAspectRatio
  }
}

function fitRatioInside(session: CropSession, ratio: number): Rect {
  const { crop: rect, canvas } = session
  const currentRatio = rect.width / rect.height
  const fittedWidth =
    currentRatio === ratio
      ? rect.width
      : currentRatio > ratio
        ? rect.height * ratio
        : rect.width
  const fittedHeight = currentRatio >= ratio ? rect.height : rect.width / ratio
  const canvasMaximumWidth = Math.min(canvas.width, canvas.height * ratio)
  const requestedMinimumWidth = Math.max(
    session.minimumSize,
    session.minimumSize * ratio,
  )
  const width = Math.max(
    fittedWidth,
    effectiveMinimum(requestedMinimumWidth, canvasMaximumWidth),
  )
  const height = width === fittedWidth ? fittedHeight : width / ratio
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  return {
    x: clamp(centerX - width / 2, 0, canvas.width - width),
    y: clamp(centerY - height / 2, 0, canvas.height - height),
    width,
    height,
  }
}

function effectiveMinimum(requested: number, maximum: number): number {
  return Math.min(requested, maximum)
}

function clampAspectWidth(
  candidateWidth: number,
  requestedMinimumWidth: number,
  maximumWidth: number,
  maximumHeight: number,
  ratio: number,
): Readonly<{ width: number; height: number }> {
  const heightLimitedWidth = maximumHeight * ratio
  const limitedByHeight = heightLimitedWidth <= maximumWidth
  const aspectMaximumWidth = limitedByHeight ? heightLimitedWidth : maximumWidth
  const width = clamp(
    candidateWidth,
    effectiveMinimum(requestedMinimumWidth, aspectMaximumWidth),
    aspectMaximumWidth,
  )
  const height =
    limitedByHeight && width === aspectMaximumWidth
      ? maximumHeight
      : width / ratio
  return { width, height }
}

function freeResize(
  session: CropSession,
  handle: CropResizeHandle,
  delta: Point,
): Rect {
  const { crop, canvas } = session
  const minimumWidth = Math.min(session.minimumSize, canvas.width)
  const minimumHeight = Math.min(session.minimumSize, canvas.height)
  let left = crop.x
  let top = crop.y
  let right = crop.x + crop.width
  let bottom = crop.y + crop.height

  if (handle.includes('West') || handle === 'west') {
    left = clamp(left + delta.x, 0, right - minimumWidth)
  }
  if (handle.includes('East') || handle === 'east') {
    right = clamp(right + delta.x, left + minimumWidth, canvas.width)
  }
  if (handle.startsWith('north')) {
    top = clamp(top + delta.y, 0, bottom - minimumHeight)
  }
  if (handle.startsWith('south')) {
    bottom = clamp(bottom + delta.y, top + minimumHeight, canvas.height)
  }

  return { x: left, y: top, width: right - left, height: bottom - top }
}

function fixedCornerResize(
  session: CropSession,
  handle: Extract<
    CropResizeHandle,
    'northEast' | 'southEast' | 'southWest' | 'northWest'
  >,
  delta: Point,
  ratio: number,
): Rect {
  const east = handle.endsWith('East')
  const south = handle.startsWith('south')
  const anchorX = east ? session.crop.x : session.crop.x + session.crop.width
  const anchorY = south ? session.crop.y : session.crop.y + session.crop.height
  const candidateFromX = session.crop.width + (east ? delta.x : -delta.x)
  const candidateFromY =
    (session.crop.height + (south ? delta.y : -delta.y)) * ratio
  const candidateWidth =
    Math.abs(candidateFromX - session.crop.width) >=
    Math.abs(candidateFromY - session.crop.width)
      ? candidateFromX
      : candidateFromY
  const horizontalMaximum = east ? session.canvas.width - anchorX : anchorX
  const verticalMaximum = south ? session.canvas.height - anchorY : anchorY
  const requestedMinimumWidth = Math.max(
    session.minimumSize,
    session.minimumSize * ratio,
  )
  const { width, height } = clampAspectWidth(
    candidateWidth,
    requestedMinimumWidth,
    horizontalMaximum,
    verticalMaximum,
    ratio,
  )
  return {
    x: clamp(east ? anchorX : anchorX - width, 0, session.canvas.width - width),
    y: clamp(
      south ? anchorY : anchorY - height,
      0,
      session.canvas.height - height,
    ),
    width,
    height,
  }
}

function fixedHorizontalResize(
  session: CropSession,
  handle: 'east' | 'west',
  delta: Point,
  ratio: number,
): Rect {
  const east = handle === 'east'
  const anchorX = east ? session.crop.x : session.crop.x + session.crop.width
  const centerY = session.crop.y + session.crop.height / 2
  const horizontalMaximum = east ? session.canvas.width - anchorX : anchorX
  const centeredHeightMaximum =
    2 * Math.min(centerY, session.canvas.height - centerY)
  const requestedMinimumWidth = Math.max(
    session.minimumSize,
    session.minimumSize * ratio,
  )
  const { width, height } = clampAspectWidth(
    session.crop.width + (east ? delta.x : -delta.x),
    requestedMinimumWidth,
    horizontalMaximum,
    centeredHeightMaximum,
    ratio,
  )
  return {
    x: clamp(east ? anchorX : anchorX - width, 0, session.canvas.width - width),
    y: clamp(centerY - height / 2, 0, session.canvas.height - height),
    width,
    height,
  }
}

function fixedVerticalResize(
  session: CropSession,
  handle: 'north' | 'south',
  delta: Point,
  ratio: number,
): Rect {
  const south = handle === 'south'
  const anchorY = south ? session.crop.y : session.crop.y + session.crop.height
  const centerX = session.crop.x + session.crop.width / 2
  const verticalMaximum = south ? session.canvas.height - anchorY : anchorY
  const centeredWidthMaximum =
    2 * Math.min(centerX, session.canvas.width - centerX)
  const requestedMinimumWidth = Math.max(
    session.minimumSize,
    session.minimumSize * ratio,
  )
  const { width, height } = clampAspectWidth(
    (session.crop.height + (south ? delta.y : -delta.y)) * ratio,
    requestedMinimumWidth,
    centeredWidthMaximum,
    verticalMaximum,
    ratio,
  )
  return {
    x: clamp(centerX - width / 2, 0, session.canvas.width - width),
    y: clamp(
      south ? anchorY : anchorY - height,
      0,
      session.canvas.height - height,
    ),
    width,
    height,
  }
}

export function createCropSession(
  document: EditorDocument,
  options: CropSessionOptions = {},
): CropSession {
  assertCanvas(document.canvas)
  const minimumSize = options.minimumSize ?? DEFAULT_MINIMUM_SIZE
  assertMinimumSize(minimumSize)
  const initialCrop = document.crop
  if (initialCrop !== null) {
    assertCropInsideCanvas(initialCrop, document.canvas)
  }
  const fullCanvas = {
    x: 0,
    y: 0,
    width: document.canvas.width,
    height: document.canvas.height,
  }
  return freezeSession({
    canvas: document.canvas,
    originalAspectRatio: document.canvas.width / document.canvas.height,
    initialCrop,
    crop: initialCrop ?? fullCanvas,
    preset: 'free',
    minimumSize,
  })
}

export function setCropPreset(
  session: CropSession,
  preset: CropPreset,
): CropSession {
  const ratio = ratioForPreset(session, preset)
  return updateSession(
    session,
    ratio === null ? session.crop : fitRatioInside(session, ratio),
    preset,
  )
}

export function moveCrop(session: CropSession, delta: Point): CropSession {
  assertDelta(delta)
  const x = clamp(
    session.crop.x + delta.x,
    0,
    session.canvas.width - session.crop.width,
  )
  const y = clamp(
    session.crop.y + delta.y,
    0,
    session.canvas.height - session.crop.height,
  )
  return updateSession(session, { ...session.crop, x, y })
}

export function resizeCrop(
  session: CropSession,
  handle: CropResizeHandle,
  delta: Point,
): CropSession {
  assertDelta(delta)
  assertResizeHandle(handle)
  const ratio = ratioForPreset(session)
  if (ratio === null) {
    return updateSession(session, freeResize(session, handle, delta))
  }
  if (handle === 'east' || handle === 'west') {
    return updateSession(
      session,
      fixedHorizontalResize(session, handle, delta, ratio),
    )
  }
  if (handle === 'north' || handle === 'south') {
    return updateSession(
      session,
      fixedVerticalResize(session, handle, delta, ratio),
    )
  }
  return updateSession(
    session,
    fixedCornerResize(session, handle, delta, ratio),
  )
}

export function nudgeCrop(
  session: CropSession,
  direction: CropNudgeDirection,
  amount = 1,
): CropSession {
  assertFinite(amount, 'nudge amount')
  if (amount < 0) throw new RangeError('nudge amount must not be negative')
  switch (direction) {
    case 'up':
      return moveCrop(session, { x: 0, y: -amount })
    case 'right':
      return moveCrop(session, { x: amount, y: 0 })
    case 'down':
      return moveCrop(session, { x: 0, y: amount })
    case 'left':
      return moveCrop(session, { x: -amount, y: 0 })
    default:
      throw new RangeError(
        `unsupported crop nudge direction: ${String(direction)}`,
      )
  }
}

export function resetCrop(session: CropSession): CropSession {
  return updateSession(
    session,
    { x: 0, y: 0, width: session.canvas.width, height: session.canvas.height },
    'free',
  )
}

function isFullCanvas(session: CropSession): boolean {
  return (
    session.crop.x === 0 &&
    session.crop.y === 0 &&
    session.crop.width === session.canvas.width &&
    session.crop.height === session.canvas.height
  )
}

function rectEquals(left: Rect, right: Rect): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

export function applyCropSession(
  session: CropSession,
): Extract<EditorCommand, { type: 'setCrop' }> {
  assertCanvas(session.canvas)
  assertCropInsideCanvas(session.crop, session.canvas)
  const after =
    session.initialCrop !== null &&
    rectEquals(session.crop, session.initialCrop)
      ? session.initialCrop
      : isFullCanvas(session)
        ? null
        : session.crop
  return Object.freeze({
    type: 'setCrop',
    before: session.initialCrop,
    after,
  })
}

/** Cancellation is deliberately not representable as a document command. */
export function cancelCropSession(session: CropSession): null {
  void session
  return null
}
