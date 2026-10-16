<script setup lang="ts">
import type { ShortcutEntryV1 } from '../generated/desktop-ipc'
import {
  actionLabel,
  displayTrigger,
  statusLabel,
  type SettingsLocale,
  type SettingsStrings,
} from './labels'

defineProps<{
  entry: ShortcutEntryV1
  locale: SettingsLocale
  labels: SettingsStrings
  busy: boolean
  manual: boolean
  macos: boolean
}>()
defineEmits<{ edit: []; remove: []; test: [] }>()
</script>

<template>
  <div class="cs-shortcut-row" :data-action="entry.action">
    <div class="cs-shortcut-description">
      <strong>{{ actionLabel(entry.action, locale) }}</strong>
      <span class="cs-settings-muted" :data-status="entry.status">{{ statusLabel(entry.status, locale) }}</span>
      <span v-if="!entry.supported" class="cs-settings-muted">{{ labels.unavailable }}</span>
      <span v-if="entry.message" class="cs-settings-error">{{ entry.message }}</span>
    </div>
    <kbd v-if="entry.display">{{ displayTrigger(entry.display, macos) }}</kbd>
    <span v-else class="cs-settings-muted">—</span>
    <div class="cs-settings-row-actions">
      <button
        :disabled="busy || !entry.supported || manual"
        :aria-label="`${labels.edit}: ${actionLabel(entry.action, locale)}`"
        @click="$emit('edit')"
      >
        {{ labels.edit }}
      </button>
      <button
        :disabled="busy || !entry.display || !entry.supported"
        :aria-label="`${labels.test}: ${actionLabel(entry.action, locale)}`"
        @click="$emit('test')"
      >
        {{ labels.test }}
      </button>
      <button
        :disabled="busy || !entry.display || manual"
        :aria-label="`${labels.remove}: ${actionLabel(entry.action, locale)}`"
        @click="$emit('remove')"
      >
        {{ labels.remove }}
      </button>
    </div>
    <details v-if="manual" class="cs-shortcut-command"><summary>CLI</summary><code>{{ entry.command }}</code></details>
  </div>
</template>
