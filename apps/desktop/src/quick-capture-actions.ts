import type { QuickRect } from './quick-capture-layout'

export interface QuickCaptureFrameSize {
  readonly width: number
  readonly height: number
}

export interface CancelQuickCaptureActionOptions {
  readonly draftId?: string | undefined
  readonly cancelDraft: (draftId: string) => Promise<unknown>
  readonly closeWindow: () => Promise<void>
}

function normalizeAxis(
  start: number,
  length: number,
  limit: number,
): readonly [start: number, length: number] {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(length) ||
    !Number.isInteger(limit) ||
    length <= 0 ||
    limit <= 0
  ) {
    throw new RangeError('quick capture selection is invalid')
  }
  const normalizedStart = Math.min(Math.max(Math.round(start), 0), limit - 1)
  const normalizedEnd = Math.min(
    Math.max(Math.round(start + length), normalizedStart + 1),
    limit,
  )
  return [normalizedStart, normalizedEnd - normalizedStart]
}

/** Converts transient scene geometry into the integer physical-pixel IPC contract. */
export function normalizeQuickCaptureSelection(
  crop: QuickRect,
  frame: QuickCaptureFrameSize,
): QuickRect {
  const [x, width] = normalizeAxis(crop.x, crop.width, frame.width)
  const [y, height] = normalizeAxis(crop.y, crop.height, frame.height)
  return { x, y, width, height }
}

/** Closing the surface must not depend on the draft-cancel IPC succeeding. */
export async function cancelQuickCaptureAction({
  draftId,
  cancelDraft,
  closeWindow,
}: CancelQuickCaptureActionOptions): Promise<void> {
  let cancellationAttempt: Promise<unknown>
  try {
    cancellationAttempt = draftId
      ? Promise.resolve(cancelDraft(draftId))
      : Promise.resolve()
  } catch (cause) {
    cancellationAttempt = Promise.reject(cause)
  }

  let closeAttempt: Promise<void>
  try {
    closeAttempt = Promise.resolve(closeWindow())
  } catch (cause) {
    closeAttempt = Promise.reject(cause)
  }

  const [cancellation, close] = await Promise.allSettled([
    cancellationAttempt,
    closeAttempt,
  ])
  if (cancellation.status === 'rejected' && close.status === 'rejected') {
    throw new AggregateError(
      [cancellation.reason, close.reason],
      'Quick capture cancellation and window close both failed',
      { cause: close.reason },
    )
  }
  if (close.status === 'rejected') throw close.reason
  if (cancellation.status === 'rejected') throw cancellation.reason
}
