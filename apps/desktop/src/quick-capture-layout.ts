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
  readonly gap?: number
  readonly margin?: number
}

export interface QuickCaptureLayout {
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

export interface PresentQuickCaptureLayoutOptions<
  T,
> extends StableQuickCaptureLayoutOptions<T> {
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
 * GTK/WebKitGTK does not allocate a hidden WebView. Map the native surface
 * after the decoded frame is ready, then refine floating chrome from visible
 * layout frames. Callers retain safe CSS placement while measurement settles.
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export function computeQuickCaptureLayout(
  input: QuickCaptureLayoutInput,
): QuickCaptureLayout {
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

  const actionFitsRight =
    input.viewport.width - right >= input.actionSize.width + gap + margin
  const actionSide: 'left' | 'right' = actionFitsRight ? 'right' : 'left'
  const preferredActionLeft = actionFitsRight
    ? right + gap
    : left - gap - input.actionSize.width
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

  const toolsFitBelow =
    input.viewport.height - bottom >= input.toolSize.height + gap + margin
  const toolSide: 'above' | 'below' = toolsFitBelow ? 'below' : 'above'
  const preferredToolTop = toolsFitBelow
    ? bottom + gap
    : top - gap - input.toolSize.height
  const toolTop = clamp(
    preferredToolTop,
    margin,
    Math.max(margin, input.viewport.height - input.toolSize.height - margin),
  )
  const toolLeft = clamp(
    left + (width - input.toolSize.width) / 2,
    margin,
    Math.max(margin, input.viewport.width - input.toolSize.width - margin),
  )

  return {
    crop: { left, top, right, bottom, width, height },
    actions: { left: actionLeft, top: actionTop, side: actionSide },
    tools: { left: toolLeft, top: toolTop, side: toolSide },
  }
}
