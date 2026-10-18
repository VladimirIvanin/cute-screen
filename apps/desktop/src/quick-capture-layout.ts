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
}

export interface StableQuickCaptureLayoutOptions<T> {
  readonly measure: () => T | undefined
  readonly nextFrame: () => Promise<void>
  readonly maximumFrames?: number
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
 * A hidden quick-capture webview can mount before Fit zoom and floating chrome
 * have reached their final dimensions. Native presentation is allowed only
 * after two consecutive animation frames report the same complete geometry.
 */
export async function waitForStableQuickCaptureLayout<T>(
  options: StableQuickCaptureLayoutOptions<T>,
): Promise<T | undefined> {
  const maximumFrames = Math.max(1, options.maximumFrames ?? 6)
  const equals = options.equals ?? Object.is
  let previous = options.measure()
  for (let frame = 0; frame < maximumFrames; frame += 1) {
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
  if (layout !== undefined) await options.reveal?.()
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
  const settings = input.settingsSize
  const expandedSize = {
    width: Math.max(input.toolSize.width, settings?.width ?? 0),
    height: input.toolSize.height + (settings ? settings.height + 6 : 0),
  }
  const actionRect = { left: actionLeft, top: actionTop, ...input.actionSize }
  const fits = (candidate: { left: number; top: number }, size: ClientSize) =>
    candidate.left >= margin &&
    candidate.top >= margin &&
    candidate.left + size.width <= input.viewport.width - margin &&
    candidate.top + size.height <= input.viewport.height - margin &&
    !(candidate.left < actionRect.left + actionRect.width &&
      candidate.left + size.width > actionRect.left &&
      candidate.top < actionRect.top + actionRect.height &&
      candidate.top + size.height > actionRect.top)
  const avoidActions = (candidate: { left: number; top: number; side: 'above' | 'below' }) => {
    const horizontalOverlap = candidate.left < actionRect.left + actionRect.width &&
      candidate.left + expandedSize.width > actionRect.left
    if (!horizontalOverlap) return candidate
    return {
      ...candidate,
      top: candidate.side === 'below'
        ? Math.max(candidate.top, actionRect.top + actionRect.height + gap)
        : Math.min(candidate.top, actionRect.top - expandedSize.height - gap),
    }
  }
  const expanded = settings
    ? (['below', 'above'] as const).map((side) => avoidActions(toolPlacement(expandedSize, side)))
        .find((candidate) => fits(candidate, expandedSize))
    : undefined
  const settingsCollapsed = Boolean(settings && !expanded)
  const toolsFitBelow = input.viewport.height - bottom >= input.toolSize.height + gap + margin
  const preferred = expanded ?? toolPlacement(input.toolSize, toolsFitBelow ? 'below' : 'above')
  const tools = {
    ...preferred,
    top: clamp(preferred.top, margin,
      Math.max(margin, input.viewport.height - (expanded ? expandedSize.height : input.toolSize.height) - margin)),
  }

  return {
    settingsCollapsed,
    crop: { left, top, right, bottom, width, height },
    actions: { left: actionLeft, top: actionTop, side: actionSide },
    tools,
  }
}
