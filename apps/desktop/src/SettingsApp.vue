<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from 'vue'
import { activationSettingsBridge } from './platform/tauri/activation-settings-adapter'
import type { ShortcutAction } from './generated/desktop-ipc'
import {
  settingsError,
  type ActivationSettingsBridge,
} from './settings/contracts'
import {
  actionLabel,
  displayTrigger,
  recordTrigger,
  strings,
  type SettingsLocale,
} from './settings/labels'
import { useSettings } from './settings/use-settings'
import ShortcutRow from './settings/ShortcutRow.vue'
import StartupPreferences from './settings/StartupPreferences.vue'
import './settings/settings.css'

const props = defineProps<{ bridge?: ActivationSettingsBridge; firstRun?: boolean }>()
const bridge = props.bridge ?? activationSettingsBridge
const state = useSettings(bridge)
const {
  snapshot,
  startup,
  error,
  busy,
  loading,
  editing,
  recording,
  trigger,
  probe,
  testing,
  testPassed,
  testExpired,
} = state
const locale = ref<SettingsLocale>(navigator.language.startsWith('ru') ? 'ru' : 'en')
const labels = computed(() => strings[locale.value])
const firstRun = props.firstRun === true || new URLSearchParams(window.location.search).get('firstRun') === '1'
const startupStep = computed(() => firstRun && snapshot.value?.autostartChoice === null)
const macos = computed(() => snapshot.value?.platform === 'macos')
const recorder = ref<HTMLButtonElement>()
const copied = ref(false)
const verificationExpired = ref(false)
const suggestions = shallowRef<Record<string, string>>({})
let unlisten: (() => void) | undefined
let polling: ReturnType<typeof setInterval> | undefined
let disposed = false

async function checkSuggestions(): Promise<void> {
  if (!snapshot.value || snapshot.value.backend === 'manual') return
  for (const value of snapshot.value.suggested) {
    try {
      const result = await bridge.probe(value)
      if (disposed) return
      suggestions.value = { ...suggestions.value, [value]: result }
    } catch (cause) {
      suggestions.value = { ...suggestions.value, [value]: 'unknown' }
      console.warn('Shortcut suggestion check failed', settingsError(cause))
    }
  }
}

async function confirmStartup(enabled: boolean): Promise<void> {
  await state.perform(async () => {
    startup.value = await bridge.setAutostart(enabled)
    snapshot.value = await bridge.snapshot()
  })
}

async function finish(): Promise<void> {
  await state.perform(async () => {
    await bridge.cancel()
    if (!snapshot.value?.setupCompleted) await bridge.completeSetup()
    await bridge.close()
  })
}

async function suggest(value: string): Promise<void> {
  await editAction('capture-area')
  await state.setTrigger(value)
  await nextTick()
  recorder.value?.focus()
}

async function editAction(action: ShortcutAction): Promise<void> {
  await state.edit(action)
  await nextTick()
  recorder.value?.focus()
  recorder.value?.scrollIntoView?.({ block: 'nearest' })
}

async function cancelEditing(): Promise<void> {
  const action = editing.value ?? snapshot.value?.pendingAction
  await state.cancel()
  if (action) document.querySelector<HTMLButtonElement>(`[data-action="${action}"] button`)?.focus()
}

function onKey(event: KeyboardEvent): void {
  if (
    event.key === 'Escape' &&
    (recording.value ||
      editing.value)
  ) {
    event.preventDefault()
    event.stopImmediatePropagation()
    void cancelEditing()
    return
  }
  if (!recording.value) return
  if (event.key === 'Tab') {
    void state.stopRecording()
    return
  }
  event.preventDefault()
  event.stopImmediatePropagation()
  const value = recordTrigger(event)
  if (value) void state.setTrigger(value)
}

function onBlur(): void {
  void state.stopRecording()
}

async function poll(): Promise<void> {
  if (disposed || busy.value) return
  if (recording.value) {
    try {
      await bridge.recording(true)
    } catch (cause) {
      error.value = settingsError(cause)
    }
    return
  }
  const wasPending = snapshot.value?.pendingAction
  await state.load()
  if (
    wasPending &&
    !snapshot.value?.pendingAction &&
    testPassed.value !== wasPending
  ) verificationExpired.value = true
}

async function copyCommand(): Promise<void> {
  const command = snapshot.value?.entries.find((entry) => entry.action === 'capture-area')?.command
  if (!command) return
  await state.perform(async () => {
    await navigator.clipboard.writeText(command)
    copied.value = true
  })
}

onMounted(async () => {
  await state.load()
  if (disposed) return
  void checkSuggestions()
  try {
    const cleanup = await bridge.listen(state.tested, (value) => {
      if (recording.value) void state.setTrigger(value)
    })
    if (disposed) cleanup()
    else unlisten = cleanup
  } catch (cause) {
    error.value = settingsError(cause)
  }
  if (disposed) return
  polling = setInterval(() => {
    void poll()
  }, 5000)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('blur', onBlur)
})

onBeforeUnmount(() => {
  disposed = true
  clearInterval(polling)
  unlisten?.()
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('blur', onBlur)
  state.dispose()
})
</script>

<template>
  <main
    class="cs-settings"
    :lang="locale"
    :aria-busy="loading || busy"
  >
    <header class="cs-settings-header">
      <div><p class="cs-settings-eyebrow">Cute Screen</p><h1>{{ labels.title }}</h1></div>
      <select v-model="locale" aria-label="Language / Язык"><option value="ru">Русский</option><option value="en">English</option></select>
    </header>
    <p class="cs-settings-muted">{{ labels.subtitle }}</p>
    <p v-if="loading" role="status">{{ labels.loading }}</p>
    <div
      v-if="error || snapshot?.error"
      class="cs-settings-error"
      role="alert"
    >
      {{ error || snapshot?.error }}
      <button v-if="!snapshot" @click="state.load">{{ labels.retry }}</button>
    </div>
    <template v-if="snapshot">
      <StartupPreferences
        v-if="startupStep"
        :first-run="true"
        :state="startup"
        :busy="busy"
        :locale="locale"
        :labels="labels"
        @confirm="confirmStartup"
      />
      <template v-else>
        <section
          v-if="!snapshot.entries.find((entry) => entry.action === 'capture-area')?.display && snapshot.backend !== 'manual'"
          class="cs-shortcut-suggestions"
          :aria-label="labels.suggested"
        >
          <strong>{{ labels.suggested }}</strong>
          <div class="cs-settings-row-actions">
            <div
              v-for="value in snapshot.suggested"
              :key="value"
              class="cs-suggestion-choice"
            >
              <button :disabled="busy || suggestions[value] === 'occupied' || suggestions[value] === 'assigned'" @click="suggest(value)">{{ displayTrigger(value, macos) }}</button>
              <span class="cs-settings-muted">{{ labels[(suggestions[value] ?? 'checking') as 'available' | 'occupied' | 'unknown' | 'assigned' | 'checking'] }}</span>
            </div>
          </div>
        </section>
        <div v-if="snapshot.backend === 'portal' || snapshot.backend === 'manual'" class="cs-settings-notice">
          <p>{{ snapshot.backend === 'portal' ? labels.portal : labels.manual }}</p>
          <button :disabled="busy || (snapshot.backend === 'portal' && !snapshot.canConfigure)" @click="state.perform(async () => { await bridge.systemSettings() })">{{ labels.system }}</button>
          <button
            v-if="snapshot.backend === 'manual'"
            :disabled="busy"
            @click="copyCommand"
          >
            {{ copied ? labels.copied : labels.copy }}
          </button>
        </div>
        <section class="cs-shortcut-list" :aria-label="labels.title">
          <ShortcutRow
            v-for="entry in snapshot.entries"
            :key="entry.action"
            :entry="entry"
            :locale="locale"
            :labels="labels"
            :busy="busy"
            :manual="snapshot.backend === 'manual'"
            :macos="macos"
            @edit="editAction(entry.action)"
            @remove="state.assign(entry.action, null)"
            @test="state.test(entry.action)"
          />
        </section>
        <section
          v-if="editing"
          class="cs-shortcut-recorder"
          :aria-label="actionLabel(editing, locale)"
        >
          <h2>{{ actionLabel(editing, locale) }}</h2>
          <button
            ref="recorder"
            class="cs-record-shortcut"
            :class="{ 'is-recording': recording }"
            :disabled="busy"
            @click="state.startRecording"
          >
            {{ recording ? labels.recording : trigger ? displayTrigger(trigger, macos) : labels.record }}
          </button>
          <p class="cs-settings-muted">{{ labels.recordHelp }}</p>
          <p v-if="probe" role="status">{{ labels[probe as 'available' | 'occupied' | 'unknown' | 'assigned' | 'checking'] ?? probe }}</p>
          <p v-if="trigger.includes('PRINT')" class="cs-settings-notice">{{ labels.print }}</p>
          <div class="cs-settings-row-actions">
            <button
              class="cs-settings-primary"
              :disabled="busy || recording || !trigger || probe === 'occupied' || probe === 'checking'"
              @click="state.assign(editing, trigger)"
            >
              {{ busy ? labels.saving : labels.apply }}
            </button>
            <button :disabled="busy" @click="cancelEditing">{{ labels.cancel }}</button>
          </div>
        </section>
        <div
          v-if="snapshot.pendingAction"
          class="cs-settings-notice"
          role="status"
        >
          <p>{{ labels.pending }}</p><button :disabled="busy" @click="state.cancel">{{ labels.cancel }}</button>
        </div>
        <p
          v-if="testing"
          role="status"
          class="cs-settings-notice"
        >
          {{ labels.testing }}
        </p>
        <p v-if="testPassed" role="status">{{ labels.tested }}: {{ actionLabel(testPassed, locale) }}</p>
        <p v-if="verificationExpired || testExpired" role="status">{{ labels.timeout }}</p>
        <p class="cs-settings-muted cs-settings-footnote">{{ labels.disclaimer }}</p>
        <StartupPreferences
          :first-run="false"
          :state="startup"
          :busy="busy"
          :locale="locale"
          :labels="labels"
          @change="confirmStartup"
          @system="state.perform(async () => { await bridge.autostartSystemSettings() })"
        />
      </template>
      <footer class="cs-settings-footer"><button :disabled="busy" @click="finish">{{ startupStep ? labels.cancel : !snapshot.setupCompleted ? labels.finish : labels.close }}</button></footer>
    </template>
  </main>
</template>
