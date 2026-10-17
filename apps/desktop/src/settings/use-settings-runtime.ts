import {
  onBeforeUnmount,
  onMounted,
} from 'vue'
import type { ActivationSettingsBridge } from './contracts'
import { settingsError } from './contracts'
import { recordTrigger } from './labels'
import type { SettingsState } from './use-settings'

export function useSettingsRuntime(
  bridge: ActivationSettingsBridge,
  state: SettingsState,
  cancelEditing: () => Promise<void>,
) {
  let unlisten: (() => void) | undefined
  let polling: ReturnType<typeof setInterval> | undefined
  let disposed = false

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && state.editing.value) {
      event.preventDefault()
      event.stopImmediatePropagation()
      void cancelEditing()
      return
    }
    if (!state.recording.value) return
    if (event.key === 'Tab') {
      void state.stopRecording()
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    const value = recordTrigger(event)
    if (value) void state.setTrigger(value)
    else if (!['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) state.invalid.value = true
  }

  function onBlur(): void {
    void state.stopRecording()
  }

  async function poll(): Promise<void> {
    if (disposed || state.busy.value) return
    if (state.recording.value) {
      try {
        await bridge.recording(true)
      } catch (cause) {
        state.recordError.value = settingsError(cause)
      }
      return
    }
    const pending = state.snapshot.value?.pendingAction
    await state.load()
    if (
      pending &&
      !state.snapshot.value?.pendingAction &&
      state.testPassed.value !== pending
    ) {
      state.verificationExpired.value = pending
    }
  }

  onMounted(async () => {
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onBlur)
    await state.load()
    if (disposed) return
    try {
      const cleanup = await bridge.listen(state.tested, (value) => {
        if (state.recording.value) void state.setTrigger(value)
      })
      if (disposed) cleanup()
      else unlisten = cleanup
    } catch (cause) {
      state.error.value = settingsError(cause)
    }
    if (disposed) return
    polling = setInterval(() => {
      void poll()
    }, 5000)

  })

  onBeforeUnmount(() => {
    disposed = true
    clearInterval(polling)
    unlisten?.()
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('blur', onBlur)
    state.dispose()
  })
}
