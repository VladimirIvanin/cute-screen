<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from 'vue'
import type { ActivationSettingsBridge } from './contracts'
import { settingsError } from './contracts'
import {
  displayTrigger,
  type SettingsLocale,
  type SettingsStrings,
} from './labels'
import type { SettingsState } from './use-settings'
import ShortcutRow from './ShortcutRow.vue'

const props = defineProps<{
  state: SettingsState
  bridge: ActivationSettingsBridge
  locale: SettingsLocale
  labels: SettingsStrings
}>()
const emit = defineEmits<{ cancel: [] }>()
const snapshot = computed(() => props.state.snapshot.value)
const busy = computed(() => props.state.busy.value)
const macos = computed(() => snapshot.value?.platform === 'macos')
const visibleEntries = computed(() => {
  const value = snapshot.value
  if (!value) return []
  return value.platform === 'macos' ? value.entries.filter((entry) => entry.supported) : value.entries
})
const copied = ref(false)
const suggestions = shallowRef<Record<string, string>>({})
let disposed = false

async function checkSuggestions(): Promise<void> {
  if (!snapshot.value || snapshot.value.backend === 'manual') return
  for (const value of snapshot.value.suggested) {
    try {
      const result = await props.bridge.probe(value)
      if (disposed) return
      suggestions.value = { ...suggestions.value, [value]: result }
    } catch (cause) {
      if (disposed) return
      suggestions.value = { ...suggestions.value, [value]: 'unknown' }
      console.warn('Shortcut suggestion check failed', settingsError(cause))
    }
  }
}

async function suggest(value: string): Promise<void> {
  await props.state.edit('capture-area')
  if (props.state.editing.value === 'capture-area') await props.state.setTrigger(value)
}

async function copyCommand(): Promise<void> {
  const command = snapshot.value?.entries.find((entry) => entry.action === 'capture-area')?.command
  if (!command) return
  const { errorAction } = props.state
  errorAction.value = undefined
  await props.state.perform(async () => {
    await navigator.clipboard.writeText(command)
    copied.value = true
  })
}

onMounted(checkSuggestions)
onBeforeUnmount(() => {
  disposed = true
})
</script>

<template>
  <section
    v-if="snapshot"
    class="cs-shortcut-settings"
    :aria-label="labels.shortcuts"
  >
    <h2 class="cs-settings-section-title">{{ labels.shortcuts }}</h2>
    <p class="cs-settings-muted">{{ labels.localHelp }}</p>
    <p>{{ labels.subtitle }}</p>
    <section
      v-if="!snapshot.entries.find((entry) => entry.action === 'capture-area')?.display && snapshot.backend !== 'manual' && !state.editing.value"
      class="cs-shortcut-suggestions"
      :aria-label="labels.suggested"
    >
      <strong>{{ labels.suggested }}</strong>
      <div class="cs-settings-row-actions">
        <button
          v-for="value in snapshot.suggested"
          :key="value"
          :disabled="busy || suggestions[value] === 'occupied' || suggestions[value] === 'assigned'"
          @click="suggest(value)"
        >
          {{ displayTrigger(value, macos) }}
        </button>
      </div>
    </section>
    <div v-if="snapshot.backend === 'portal' || snapshot.backend === 'manual'" class="cs-settings-notice">
      <p>{{ snapshot.backend === 'portal' ? labels.portal : labels.manual }}</p>
      <div class="cs-settings-row-actions">
        <button :disabled="busy || (snapshot.backend === 'portal' && !snapshot.canConfigure)" @click="state.perform(async () => { await bridge.systemSettings() })">{{ labels.system }}</button>
        <button
          v-if="snapshot.backend === 'manual'"
          :disabled="busy"
          @click="copyCommand"
        >
          {{ copied ? labels.copied : labels.copy }}
        </button>
      </div>
    </div>
    <section class="cs-shortcut-list" :aria-label="labels.shortcuts">
      <ShortcutRow
        v-for="entry in visibleEntries"
        :key="entry.action"
        :entry="entry"
        :locale="locale"
        :labels="labels"
        :state="state"
        @cancel="emit('cancel')"
      />
    </section>
    <details class="cs-settings-footnote cs-settings-muted"><summary>{{ labels.help }}</summary><p>{{ labels.disclaimer }}</p></details>
  </section>
</template>
