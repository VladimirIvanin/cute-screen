import { onScopeDispose } from 'vue'
import type { ComputedRef } from 'vue'
import { t } from './i18n'
import type { ShellStoreOptions } from './store-contracts'
import type { ShellStoreState } from './store-state'
import { setCaptureProgress } from './store-state'
import type {
  AsyncActionName,
  AsyncActionState,
  SupportedLocale,
} from './types'

export const TRANSIENT_ACTION_FEEDBACK_MS = 3_000

export class ActionCancelledError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionCancelledError'
  }
}

function actionErrorMessage(
  error: unknown,
  locale: SupportedLocale,
): string {
  if (error instanceof Error && error.message === 'permissionDenied') {
    return t(locale, 'captureScreenRecordingDenied')
  }
  return error instanceof Error ? error.message : String(error)
}

function unavailableMessage(
  action: AsyncActionName,
  locale: SupportedLocale,
): string {
  const key =
    action === 'capture' || action === 'captureWindow'
      ? 'captureUnavailable'
      : action === 'openImage'
        ? 'openImageUnavailable'
        : action === 'copy'
          ? 'copyUnavailable'
          : 'exportUnavailable'
  return t(locale, key)
}

export function createActionActions(
  state: ShellStoreState,
  locale: ComputedRef<SupportedLocale>,
  getOptions: () => ShellStoreOptions | undefined,
) {
  let controller: AbortController | undefined
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined
  function clearFeedbackTimer(): void {
    if (feedbackTimer === undefined) return
    clearTimeout(feedbackTimer)
    feedbackTimer = undefined
  }
  function publishFeedback(next: AsyncActionState): void {
    clearFeedbackTimer()
    state.actionState.value = next
    if (next.status !== 'success' && next.status !== 'cancelled') return
    const published = next
    feedbackTimer = setTimeout(() => {
      feedbackTimer = undefined
      const current = state.actionState.value
      if (current.status !== 'success' && current.status !== 'cancelled') return
      if (current.status !== published.status) return
      if (current.action !== published.action) return
      if (current.message !== published.message) return
      state.actionState.value = { status: 'idle' }
    }, TRANSIENT_ACTION_FEEDBACK_MS)
  }
  function clearFeedback(): void {
    publishFeedback({ status: 'idle' })
  }
  function cancelAction(): void {
    controller?.abort()
  }
  async function runAction(action: AsyncActionName): Promise<void> {
    const options = getOptions()
    if (!options?.actions) {
      publishFeedback({
        status: 'error',
        action,
        message: unavailableMessage(action, locale.value),
      })
      return
    }
    controller?.abort()
    const actionController = new AbortController()
    controller = actionController
    const captures = action === 'capture' || action === 'captureWindow'
    publishFeedback(
      captures
        ? { status: 'pending', action, captureProgress: 'probing' }
        : { status: 'pending', action },
    )
    try {
      const message = await options.actions.run(
        action,
        actionController.signal,
        captures ? (progress) => setCaptureProgress(state, progress) : undefined,
      )
      publishFeedback({ status: 'success', action, message })
    } catch (error) {
      if (actionController.signal.aborted || error instanceof ActionCancelledError) {
        publishFeedback({
          status: 'cancelled',
          action,
          message: error instanceof ActionCancelledError ? error.message : t(locale.value, 'captureCancelled'),
        })
      } else {
        publishFeedback({
          status: 'error',
          action,
          message: actionErrorMessage(error, locale.value),
        })
      }
    } finally {
      if (controller === actionController) controller = undefined
    }
  }
  onScopeDispose(clearFeedbackTimer)
  return { cancelAction, clearFeedback, runAction }
}
