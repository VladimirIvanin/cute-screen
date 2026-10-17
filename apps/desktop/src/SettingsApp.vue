<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
} from 'vue'
import { activationSettingsBridge } from './platform/tauri/activation-settings-adapter'
import { type ActivationSettingsBridge } from './settings/contracts'
import {
  strings,
  type SettingsLocale,
} from './settings/labels'
import { useSettings } from './settings/use-settings'
import { useSettingsRuntime } from './settings/use-settings-runtime'
import { uiPreferencesSyncError } from './platform/tauri/ui-preferences-adapter'
import {
  createBrowserPreferencesStorage,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import GeneralSettings from './settings/GeneralSettings.vue'
import HistorySettings from './history/HistorySettings.vue'
import { listenHistorySettings } from './platform/tauri/history-adapter'
import {
  onMounted,
  onBeforeUnmount,
} from 'vue'
import ShortcutSettings from './settings/ShortcutSettings.vue'
import StartupPreferences from './settings/StartupPreferences.vue'
import './settings/settings.css'

const props = defineProps<{ bridge?: ActivationSettingsBridge; firstRun?: boolean }>()
const scrollPanel = ref<HTMLElement>()
const bridge = props.bridge ?? activationSettingsBridge
const state = useSettings(bridge)
const { snapshot, startup, error, busy, loading, errorAction } = state
const shellStore = useEditorShellStore()
shellStore.initialize({
  languages: navigator.languages,
  preferences: createBrowserPreferencesStorage(window.localStorage, navigator.languages),
  systemDark: () => window.matchMedia('(prefers-color-scheme: dark)').matches,
})
const locale = computed<SettingsLocale>(() => shellStore.locale)
const labels = computed(() => strings[locale.value])
const query = new URLSearchParams(window.location.search)
const firstRun = props.firstRun === true || query.get('firstRun') === '1'
const startupStep = computed(() => firstRun && snapshot.value?.autostartChoice === null)
const closeLabel = computed(() => {
  if (startupStep.value) return labels.value.cancel
  return snapshot.value?.setupCompleted ? labels.value.close : labels.value.finish
})
const section = ref(query.get('settings') === 'history' ? 'history' : query.get('settings') === 'shortcuts' ? 'shortcuts' : 'general')
let unlistenHistory: (() => void) | undefined
let disposedHistory = false
onMounted(async () => {
  if (!('__TAURI_INTERNALS__' in window)) return
  const cleanup = await listenHistorySettings(() => {
    void navigate('history')
  })
  if (disposedHistory) cleanup()
  else unlistenHistory = cleanup
})
onBeforeUnmount(() => {
  disposedHistory = true
  unlistenHistory?.()
})

async function confirmStartup(enabled: boolean): Promise<void> {
  errorAction.value = undefined
  await state.perform(async () => {
    startup.value = await bridge.setAutostart(enabled)
    snapshot.value = await bridge.snapshot()
    if (firstRun) section.value = 'shortcuts'
  })
}

async function finish(): Promise<void> {
  errorAction.value = undefined
  await state.cancel()
  if (error.value) return
  await state.perform(async () => {
    if (!snapshot.value?.setupCompleted) await bridge.completeSetup()
    await bridge.close()
  })
}

async function cancelEditing(): Promise<void> {
  const action = state.editing.value ?? snapshot.value?.pendingAction
  await state.cancel()
  await nextTick()
  if (action) document.querySelector<HTMLButtonElement>(`[data-edit="${action}"]`)?.focus()
}

async function navigate(value: string): Promise<void> {
  if (section.value === value || busy.value) return
  await state.cancel()
  if (error.value) return
  errorAction.value = undefined
  section.value = value
  await nextTick()
  scrollPanel.value?.scrollTo?.(0, 0)
}

async function startupSystem(): Promise<void> {
  errorAction.value = undefined
  await state.perform(async () => {
    await bridge.autostartSystemSettings()
  })
}

useSettingsRuntime(bridge, state, cancelEditing)
</script>

<template>
  <main
    class="cs-settings"
    :lang="locale"
    :aria-busy="loading || busy"
  >
    <aside class="cs-settings-sidebar">
      <header><p class="cs-settings-eyebrow">Cute Screen</p><h1>{{ labels.title }}</h1></header>
      <nav :aria-label="labels.navigation">
        <button
          :aria-current="section === 'general' ? 'page' : undefined"
          :disabled="busy || startupStep"
          @click="navigate('general')"
        >
          {{ labels.general }}
        </button>
        <button
          :aria-current="section === 'history' ? 'page' : undefined"
          :disabled="busy || startupStep"
          @click="navigate('history')"
        >
          {{ locale === 'ru' ? 'История и хранение' : 'History and storage' }}
        </button>
        <button
          :aria-current="section === 'shortcuts' ? 'page' : undefined"
          :disabled="busy || startupStep"
          @click="navigate('shortcuts')"
        >
          {{ labels.shortcuts }}
        </button>
      </nav>
    </aside>
    <div class="cs-settings-content">
      <div ref="scrollPanel" class="cs-settings-scroll">
        <p
          v-if="uiPreferencesSyncError"
          role="alert"
          class="cs-settings-error"
        >
          {{ locale === 'ru'
            ? 'Не удалось сохранить настройки интерфейса. Выберите язык ещё раз.'
            : 'Could not save interface preferences. Select the language again.' }}
          {{ uiPreferencesSyncError }}
        </p>
        <p v-if="loading" role="status">{{ labels.loading }}</p>
        <div
          v-if="(error && !errorAction) || snapshot?.error"
          class="cs-settings-error"
          role="alert"
        >
          {{ (error && !errorAction) ? error : snapshot?.error }}
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
            @system="startupSystem"
          />
          <GeneralSettings
            v-else-if="section === 'general'"
            :locale="locale"
            :labels="labels"
            :state="state"
            @locale="shellStore.setLocale($event)"
            @startup="confirmStartup"
            @system="startupSystem"
          />
          <HistorySettings v-else-if="section === 'history'" :locale="locale" />
          <ShortcutSettings
            v-else
            :state="state"
            :bridge="bridge"
            :locale="locale"
            :labels="labels"
            @cancel="cancelEditing"
          />
        </template>
      </div>
      <p v-if="firstRun" class="cs-settings-retention">
        {{ locale === 'ru'
          ? 'История временная: до 7 дней, 512 МиБ и 200 снимков. Старые снимки удаляются вместе с аннотациями. Защитите важные снимки от очистки или экспортируйте результат.'
          : 'History is temporary: up to 7 days, 512 MiB and 200 captures. Old captures and their annotations are deleted automatically. Protect important captures or export the result.' }}
      </p>
      <footer v-if="snapshot" class="cs-settings-footer">
        <button :disabled="busy" @click="finish">{{ closeLabel }}</button>
      </footer>
    </div>
  </main>
</template>
