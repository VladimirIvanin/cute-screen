<script setup lang="ts">
import type {
  SettingsLocale,
  SettingsStrings,
} from './labels'
import type { SettingsState } from './use-settings'
import StartupPreferences from './StartupPreferences.vue'

defineProps<{ locale: SettingsLocale; labels: SettingsStrings; state: SettingsState }>()
const emit = defineEmits<{ locale: [value: SettingsLocale]; startup: [enabled: boolean]; system: [] }>()
</script>

<template>
  <section :aria-label="labels.general">
    <h2 class="cs-settings-section-title">{{ labels.general }}</h2>
    <p class="cs-settings-muted">{{ labels.generalHelp }}</p>
    <div class="cs-settings-language">
      <label for="settings-language">{{ labels.language }}</label>
      <select
        id="settings-language"
        :value="locale"
        aria-label="Language / Язык"
        @change="emit('locale', ($event.target as HTMLSelectElement).value as SettingsLocale)"
      >
        <option value="ru">Русский</option><option value="en">English</option>
      </select>
    </div>
    <StartupPreferences
      :first-run="false"
      :state="state.startup.value"
      :busy="state.busy.value"
      :locale="locale"
      :labels="labels"
      @change="emit('startup', $event)"
      @system="emit('system')"
    />
  </section>
</template>
