import {
  ref,
  type ShallowRef,
} from 'vue'
import type {
  ShortcutAction,
  ShortcutSnapshotV1,
} from '../generated/desktop-ipc'
import {
  settingsError,
  type ActivationSettingsBridge,
} from './contracts'

export function useShortcutRecorder(
  bridge: ActivationSettingsBridge,
  snapshot: ShallowRef<ShortcutSnapshotV1 | undefined>,
) {
  const editing = ref<ShortcutAction>()
  const recording = ref(false)
  const trigger = ref('')
  const probe = ref('')
  const recordError = ref('')
  const invalid = ref(false)
  const conflictAction = ref<ShortcutAction>()
  let generation = 0
  let disposed = false
  let leaseGeneration = 0

  async function stopRecording(): Promise<void> {
    leaseGeneration++
    recording.value = false
    try {
      await bridge.recording(false)
    } catch (cause) {
      recordError.value = settingsError(cause)
    }
  }

  function reset(): void {
    generation++
    editing.value = undefined
    trigger.value = ''
    probe.value = ''
    recordError.value = ''
    invalid.value = false
    conflictAction.value = undefined
  }

  async function startRecording(): Promise<void> {
    generation++
    const request = ++leaseGeneration
    recordError.value = ''
    invalid.value = false
    probe.value = ''
    trigger.value = ''
    conflictAction.value = undefined
    try {
      await bridge.recording(true)
      if (request === leaseGeneration && !disposed) recording.value = true
    } catch (cause) {
      if (request === leaseGeneration) recordError.value = settingsError(cause)
    }
  }

  async function edit(action: ShortcutAction): Promise<void> {
    reset()
    const request = generation
    await stopRecording()
    if (disposed || request !== generation) return
    editing.value = action
    await startRecording()
  }

  async function setTrigger(value: string): Promise<void> {
    const request = ++generation
    const action = editing.value
    if (!action || disposed) return
    trigger.value = value
    invalid.value = false
    recordError.value = ''
    conflictAction.value = undefined
    probe.value = 'checking'
    await stopRecording()
    if (request !== generation || disposed) return
    const existing = snapshot.value?.entries.find((entry) => entry.trigger === value)
    if (existing) {
      probe.value = existing.action === action ? 'unchanged' : 'assigned'
      if (existing.action !== action) conflictAction.value = existing.action
      return
    }
    try {
      const result = await bridge.probe(value)
      if (request === generation && !disposed) probe.value = result
    } catch (cause) {
      if (request === generation && !disposed) {
        probe.value = 'failed'
        recordError.value = settingsError(cause)
      }
    }
  }

  async function cancelRecording(): Promise<void> {
    reset()
    await stopRecording()
  }

  function disposeRecorder(): void {
    disposed = true
    reset()
    void stopRecording()
  }

  return {
    editing, recording, trigger, probe, recordError, invalid, conflictAction,
    edit, startRecording, stopRecording, setTrigger, cancelRecording, disposeRecorder,
  }
}
