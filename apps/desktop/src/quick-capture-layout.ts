export interface QuickRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface ClientRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface ClientSize {
  readonly width: number
  readonly height: number
}

export interface QuickCaptureLayoutInput {
  readonly viewport: ClientSize
  readonly scene: ClientRect
  readonly source: ClientSize
  readonly crop: QuickRect
  readonly actionSize: ClientSize
  readonly toolSize: ClientSize
  readonly settingsSize?: ClientSize
  readonly gap?: number
  readonly margin?: number
}

export interface QuickCaptureLayout {
  readonly settingsCollapsed: boolean
  readonly crop: {
    readonly left: number
    readonly top: number
    readonly right: number
    readonly bottom: number
    readonly width: number
    readonly height: number
  }
  readonly actions: {
    readonly left: number
    readonly top: number
    readonly side: 'left' | 'right'
  }
  readonly tools: {
    readonly left: number
    readonly top: number
    readonly side: 'above' | 'below'
  }
  readonly settings?: {
    readonly left: number
    readonly top: number
    readonly side: 'above' | 'below'
  }
}

/** Mutter can resize a just-fullscreen Quick window slower than six frames. */
export const QUICK_CAPTURE_LAYOUT_DEADLINE_MS = 2_000

export interface StableQuickCaptureLayoutOptions<T> {
  readonly measure: () => T | undefined
  readonly nextFrame: () => Promise<void>
  readonly deadlineMs?: number
  readonly now?: () => number
  readonly equals?: (previous: T, current: T) => boolean
}

export interface PresentQuickCaptureLayoutOptions<T> extends StableQuickCaptureLayoutOptions<T> {
  readonly present: () => Promise<boolean>
  readonly reveal?: () => Promise<void>
}

export interface PresentedQuickCaptureLayout<T> {
  readonly presented: boolean
  readonly layout?: T | undefined
}

/**
 * A mapped quick-capture webview can still be resizing after fullscreen.
 * Two consecutive frames with the same complete geometry finish early.
 * The wait is bounded by time, not by a frame count Mutter can miss.
 */
export async function waitForStableQuickCaptureLayout<T>(
  options: StableQuickCaptureLayoutOptions<T>,
): Promise<T | undefined> {
  const deadlineMs = Math.max(0, options.deadlineMs ?? QUICK_CAPTURE_LAYOUT_DEADLINE_MS)
  const now = options.now ?? (() => performance.now())
  const equals = options.equals ?? Object.is
  const started = now()
  let previous = options.measure()
  let elapsed = 0
  while (elapsed < deadlineMs) {
    await options.nextFrame()
    const current = options.measure()
    if (
      previous !== undefined &&
      current !== undefined &&
      equals(previous, current)
    ) {
      return current
    }
    previous = current
    const observed = now() - started
    elapsed = observed > elapsed ? observed : elapsed + 1
  }
  return undefined
}

/**
 * After GTK's nearly transparent mapped warmup has allowed the decoded frame
 * to render, acknowledge native presentation and refine floating chrome from
 * mapped layout frames. Callers retain safe CSS placement while measurement
 * settles; `reveal` only changes the prepared surface's presentation state.
 */
export async function presentThenWaitForStableQuickCaptureLayout<T>(
  options: PresentQuickCaptureLayoutOptions<T>,
): Promise<PresentedQuickCaptureLayout<T>> {
  const presented = await options.present()
  if (!presented) return { presented: false }
  const layout = await waitForStableQuickCaptureLayout(options)
  // A late or still-moving layout must not cancel the capture. Unplaced
  // chrome stays hidden until it receives data-placement.
  await options.reveal?.()
  return { presented: true, layout }
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.max(minimum, Math.min(maximum, value))
}

/** A passive portal note must avoid the action buttons, tools and captured pixels. */
export function placeQuickCaptureNote(
  viewport: ClientSize,
  note: ClientSize,
  actions: ClientRect,
  tools: ClientRect,
  crop: ClientRect,
): { left: number; top: number } {
  const margin = 8
  const gap = 12
  const right = viewport.width - note.width - margin
  const bottom = viewport.height - note.height - margin
  const candidates = [
    { left: actions.left, top: actions.top + actions.height + gap },
    { left: actions.left + actions.width - note.width, top: actions.top + actions.height + gap },
    { left: actions.left, top: actions.top - note.height - gap },
    { left: actions.left + actions.width - note.width, top: actions.top - note.height - gap },
    { left: margin, top: margin },
    { left: right, top: margin },
    { left: margin, top: bottom },
    { left: right, top: bottom },
  ].map((point) => ({
    left: clamp(point.left, margin, Math.max(margin, right)),
    top: clamp(point.top, margin, Math.max(margin, bottom)),
  }))
  const overlap = (point: { left: number; top: number }, rect: ClientRect) =>
    Math.max(0, Math.min(point.left + note.width, rect.left + rect.width) - Math.max(point.left, rect.left)) *
    Math.max(0, Math.min(point.top + note.height, rect.top + rect.height) - Math.max(point.top, rect.top))
  const score = (point: { left: number; top: number }) =>
    (overlap(point, actions) + overlap(point, tools)) * viewport.width * viewport.height + overlap(point, crop)
  return candidates.reduce((best, point) => score(point) < score(best) ? point : best)
}

export function computeQuickCaptureLayout(input: QuickCaptureLayoutInput): QuickCaptureLayout {
  const margin = input.margin ?? 8
  const gap = input.gap ?? 12
  const scaleX = input.scene.width / Math.max(1, input.source.width)
  const scaleY = input.scene.height / Math.max(1, input.source.height)
  const left = input.scene.left + input.crop.x * scaleX
  const top = input.scene.top + input.crop.y * scaleY
  const width = input.crop.width * scaleX
  const height = input.crop.height * scaleY
  const right = left + width
  const bottom = top + height

  const actionFitsRight = input.viewport.width - right >= input.actionSize.width + gap + margin
  const actionSide: 'left' | 'right' = actionFitsRight ? 'right' : 'left'
  const preferredActionLeft = actionFitsRight ? right + gap : left - gap - input.actionSize.width
  const actionLeft = clamp(
    preferredActionLeft,
    margin,
    Math.max(margin, input.viewport.width - input.actionSize.width - margin),
  )
  const actionTop = clamp(
    top + (height - input.actionSize.height) / 2,
    margin,
    Math.max(margin, input.viewport.height - input.actionSize.height - margin),
  )

  const toolPlacement = (size: ClientSize, side: 'below' | 'above') => ({
    left: clamp(left + (width - size.width) / 2, margin,
      Math.max(margin, input.viewport.width - size.width - margin)),
    top: side === 'below' ? bottom + gap : top - gap - size.height,
    side,
  })
  const toolsFitBelow = input.viewport.height - bottom >= input.toolSize.height + gap + margin
  const preferred = toolPlacement(input.toolSize, toolsFitBelow ? 'below' : 'above')
  const tools = {
    ...preferred,
    top: clamp(preferred.top, margin,
      Math.max(margin, input.viewport.height - input.toolSize.height - margin)),
  }
  const settings = placeQuickCaptureSettings({
    viewport: input.viewport,
    margin,
    gap,
    tools,
    toolSize: input.toolSize,
    settingsSize: input.settingsSize,
    actions: { left: actionLeft, top: actionTop, ...input.actionSize },
  })

  return {
    settingsCollapsed: Boolean(input.settingsSize && !settings),
    crop: { left, top, right, bottom, width, height },
    actions: { left: actionLeft, top: actionTop, side: actionSide },
    tools,
    ...(settings ? { settings } : {}),
  }
}

const settingsGap = 6

function placeQuickCaptureSettings(input: {
  viewport: ClientSize
  margin: number
  gap: number
  tools: { left: number; top: number; side: 'above' | 'below' }
  toolSize: ClientSize
  settingsSize?: ClientSize | undefined
  actions: ClientRect
}): { left: number; top: number; side: 'above' | 'below' } | undefined {
  const settings = input.settingsSize
  if (!settings) return undefined
  const maxWidth = input.viewport.width - input.margin * 2
  if (settings.width > maxWidth || settings.height <= 0) return undefined
  const side = input.tools.side === 'below' ? 'above' : 'below'
  const top = side === 'above'
    ? input.tools.top - settingsGap - settings.height
    : input.tools.top + input.toolSize.height + settingsGap
  if (
    top < input.margin ||
    top + settings.height > input.viewport.height - input.margin
  ) return undefined
  const minLeft = input.margin
  const maxLeft = Math.max(input.margin, input.viewport.width - settings.width - input.margin)
  const preferredLeft = input.tools.left + (input.toolSize.width - settings.width) / 2
  const overlapsActions = (candidateLeft: number) =>
    candidateLeft < input.actions.left + input.actions.width &&
    candidateLeft + settings.width > input.actions.left &&
    top < input.actions.top + input.actions.height &&
    top + settings.height > input.actions.top
  const fits = (candidateLeft: number) =>
    candidateLeft >= minLeft &&
    candidateLeft <= maxLeft &&
    !overlapsActions(candidateLeft)
  const clamped = clamp(preferredLeft, minLeft, maxLeft)
  if (!overlapsActions(clamped)) return { left: clamped, top, side }
  const shifted = [
    input.actions.left - input.gap - settings.width,
    input.actions.left + input.actions.width + input.gap,
  ].filter(fits)
  if (shifted.length === 0) return undefined
  const left = shifted.reduce((best, candidate) =>
    Math.abs(candidate - preferredLeft) < Math.abs(best - preferredLeft) ? candidate : best)
  return { left, top, side }
}
