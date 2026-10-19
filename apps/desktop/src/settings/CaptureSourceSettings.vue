<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'
import type {
  LinuxCaptureMethod,
  LinuxCaptureMethods,
} from '../generated/desktop-ipc'
import { nativeCaptureSource } from '../platform/tauri/capture-source-adapter'
import type { CaptureSourceBridge } from './capture-source'
import { settingsError } from './contracts'

const props = defineProps<{ locale: 'ru' | 'en'; bridge?: CaptureSourceBridge }>()
const bridge = props.bridge ?? ('__TAURI_INTERNALS__' in window ? nativeCaptureSource : undefined)
const snapshot = ref<LinuxCaptureMethods | null>(null)
const selected = ref<LinuxCaptureMethod>('auto')
const loading = ref(Boolean(bridge))
const pending = ref(false)
const error = ref('')
const saved = ref(false)
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})

const text = computed(() => props.locale === 'ru' ? {
  title: 'Захват экрана', method: 'Способ захвата', checking: 'Проверка способов захвата…',
  save: 'Применить', saving: 'Сохранение…', cancel: 'Отменить изменение', retry: 'Повторить проверку',
  saved: 'Способ захвата сохранён.', busy: 'Завершите текущий захват и повторите изменение.',
  missing: 'Выбранный способ недоступен. Выберите Автоматически или установите нужную системную утилиту.',
  unavailable: ' — недоступно', active: 'Используется: ',
  help: 'Для Области, Экрана и Повтора. Снимки разовые: постоянная трансляция экрана не включается. Выбор окна использует системный диалог.',
  portal: 'Системное разрешение зависит от окружения. Современные версии GNOME запоминают разрешение; старые могут спрашивать каждый раз.',
  gnome: 'Для GNOME. Нужна утилита gnome-screenshot. Возможны системная вспышка и небольшая задержка. Захватывается весь рабочий стол.',
  grim: 'Для совместимых wlroots-композиторов. Нужна утилита grim и протокол screencopy. Захватывается весь рабочий стол.',
  names: { auto: 'Автоматически', portal: 'Системный снимок (portal)', gnomeScreenshot: 'Совместимость с GNOME', grim: 'Совместимость с wlroots (grim)' },
} : {
  title: 'Screen capture', method: 'Capture method', checking: 'Checking capture methods…',
  save: 'Apply', saving: 'Saving…', cancel: 'Cancel change', retry: 'Check again',
  saved: 'Capture method saved.', busy: 'Finish the current capture before changing the method.',
  missing: 'The selected method is unavailable. Choose Automatic or install the required system utility.',
  unavailable: ' — unavailable', active: 'Using: ',
  help: 'For Area, Screen and Repeat. Captures are individual screenshots; screen sharing stays off. Window selection uses the system dialog.',
  portal: 'System permission depends on your desktop. Modern GNOME versions remember permission; older versions may ask every time.',
  gnome: 'For GNOME. Requires gnome-screenshot. A system flash and a short delay are possible. Captures the entire desktop.',
  grim: 'For compatible wlroots compositors. Requires grim and the screencopy protocol. Captures the entire desktop.',
  names: { auto: 'Automatic', portal: 'System screenshot (portal)', gnomeScreenshot: 'GNOME compatibility', grim: 'wlroots compatibility (grim)' },
})
const methods: LinuxCaptureMethod[] = ['auto', 'portal', 'gnomeScreenshot', 'grim']
const changed = computed(() => selected.value !== snapshot.value?.selected)
const hint = computed(() => {
  const method = selected.value === 'auto' ? snapshot.value?.resolved : selected.value
  return method === 'gnomeScreenshot' ? text.value.gnome : method === 'grim' ? text.value.grim : text.value.portal
})

async function load(): Promise<void> {
  if (!bridge) return
  loading.value = true
  error.value = ''
  try {
    const result = await bridge.snapshot()
    if (!disposed) {
      snapshot.value = result
      selected.value = result?.selected ?? 'auto'
    }
  } catch (cause) {
    if (!disposed) error.value = settingsError(cause)
  } finally {
    if (!disposed) loading.value = false
  }
}

async function save(): Promise<void> {
  if (
    !bridge ||
    pending.value ||
    !changed.value
  ) return
  pending.value = true
  error.value = ''
  saved.value = false
  try {
    const result = await bridge.save(selected.value)
    if (!disposed) {
      snapshot.value = result
      selected.value = result.selected
      saved.value = true
    }
  } catch (cause) {
    if (!disposed) error.value = typeof cause === 'object' && cause && 'code' in cause && cause.code === 'busy'
      ? text.value.busy : settingsError(cause)
  } finally {
    if (!disposed) pending.value = false
  }
}

function cancel(): void {
  selected.value = snapshot.value?.selected ?? 'auto'
  error.value = ''
  saved.value = false
}
onMounted(load)
</script>

<template>
  <section
    v-if="loading || snapshot || error"
    :aria-label="text.title"
    class="cs-settings-card"
  >
    <h3>{{ text.title }}</h3>
    <p v-if="loading" role="status">{{ text.checking }}</p>
    <template v-else-if="snapshot">
      <p class="cs-settings-muted">{{ text.help }}</p>
      <label class="cs-capture-method">
        <span>{{ text.method }}</span>
        <select
          v-model="selected"
          :disabled="pending"
          @change="saved = false"
        >
          <option
            v-for="method in methods"
            :key="method"
            :value="method"
            :disabled="!snapshot.available.includes(method)"
          >
            {{ text.names[method] }}{{ snapshot.available.includes(method) ? '' : text.unavailable }}
          </option>
        </select>
      </label>
      <p class="cs-settings-muted">{{ hint }}</p>
      <p v-if="snapshot.resolved" class="cs-settings-muted">{{ text.active }}{{ text.names[snapshot.resolved] }}</p>
      <p v-else role="status">{{ text.missing }}</p>
      <div class="cs-capture-method-actions">
        <button
          :disabled="pending || !changed"
          :aria-busy="pending"
          @click="save"
        >
          {{ pending ? text.saving : text.save }}
        </button>
        <button
          v-if="changed"
          :disabled="pending"
          @click="cancel"
        >
          {{ text.cancel }}
        </button>
      </div>
      <p v-if="saved" role="status">{{ text.saved }}</p>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <button
      v-if="error"
      :disabled="pending || loading"
      @click="load"
    >
      {{ text.retry }}
    </button>
  </section>
</template>

<style scoped>
.cs-settings-card {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}
.cs-settings-card h3 {
  margin: 0 0 12px;
  font-size: 15px;
}
.cs-capture-method {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.cs-capture-method select {
  max-width: 100%;
}
.cs-capture-method-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
