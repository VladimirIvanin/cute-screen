import type { ComputedRef } from 'vue'
import { t } from './i18n'
import type { ShellStoreOptions } from './store-contracts'
import type { ShellStoreState } from './store-state'
import { setCaptureProgress } from './store-state'
import type { AsyncActionName, SupportedLocale } from './types'

export class ActionCancelledError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionCancelledError'
  }
}

function actionErrorMessage(error: unknown, locale: SupportedLocale): string {
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
  function clearFeedback(): void {
    state.actionState.value = { status: 'idle' }
  }
  function cancelAction(): void {
    controller?.abort()
  }
  async function runAction(action: AsyncActionName): Promise<void> {
    const options = getOptions()
    if (!options?.actions) {
      state.actionState.value = {
        status: 'error',
        action,
        message: unavailableMessage(action, locale.value),
      }
      return
    }
    controller?.abort()
    const actionController = new AbortController()
    controller = actionController
    const captures = action === 'capture' || action === 'captureWindow'
    state.actionState.value = captures
      ? { status: 'pending', action, captureProgress: 'probing' }
      : { status: 'pending', action }
    try {
      const message = await options.actions.run(
        action,
        actionController.signal,
        captures
          ? (progress) => setCaptureProgress(state, progress)
          : undefined,
      )
      state.actionState.value = { status: 'success', action, message }
    } catch (error) {
      if (
        actionController.signal.aborted ||
        error instanceof ActionCancelledError
      ) {
        state.actionState.value = {
          status: 'cancelled',
          action,
          message:
            error instanceof ActionCancelledError
              ? error.message
              : t(locale.value, 'captureCancelled'),
        }
      } else {
        state.actionState.value = {
          status: 'error',
          action,
          message: actionErrorMessage(error, locale.value),
        }
      }
    } finally {
      if (controller === actionController) controller = undefined
    }
  }
  return { cancelAction, clearFeedback, runAction }
}
