<script setup lang="ts">
import { ref } from 'vue'
import type { AutostartSnapshotV1 } from '../generated/desktop-ipc'
import {
  statusLabel,
  type SettingsLocale,
  type SettingsStrings,
} from './labels'

const props = defineProps<{
  state?: AutostartSnapshotV1 | undefined
  firstRun: boolean
  busy: boolean
  locale: SettingsLocale
  labels: SettingsStrings
}>()
const emit = defineEmits<{ change: [enabled: boolean]; confirm: [enabled: boolean]; system: [] }>()
const initialChoice = ref(true)

function change(event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked
  if (props.firstRun) initialChoice.value = enabled
  else emit('change', enabled)
}
</script>

<template>
  <section class="cs-startup-preferences" :aria-label="labels.startup">
    <h2>{{ firstRun ? labels.welcome : labels.startup }}</h2>
    <p class="cs-settings-muted">{{ firstRun ? labels.welcomeHelp : labels.startupHelp }}</p>
    <label class="cs-startup-choice">
      <input
        type="checkbox"
        :checked="firstRun ? initialChoice : state?.state === 'enabled'"
        :disabled="busy || (!firstRun && state?.state === 'unavailable')"
        @change="change"
      />
      <span>{{ labels.startupLabel }}</span>
    </label>
    <p
      v-if="!firstRun && state"
      role="status"
      class="cs-settings-muted"
    >
      {{ statusLabel(state.state, locale) }}
    </p>
    <p v-if="state?.message" class="cs-settings-error">{{ state.message }}</p>
    <button
      v-if="firstRun"
      class="cs-settings-primary"
      :disabled="busy"
      @click="emit('confirm', initialChoice)"
    >
      {{ busy ? labels.saving : labels.continue }}
    </button>
    <button
      v-else
      :disabled="busy"
      @click="emit('system')"
    >
      {{ labels.startupSystem }}
    </button>
  </section>
</template>
