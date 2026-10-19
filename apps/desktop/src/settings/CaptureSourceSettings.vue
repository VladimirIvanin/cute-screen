<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'
import { nativeCaptureSource } from '../platform/tauri/capture-source-adapter'
import type { CaptureSourceBridge } from './capture-source'
import { settingsError } from './contracts'

const props = defineProps<{ locale: 'ru' | 'en'; bridge?: CaptureSourceBridge }>()
const bridge = props.bridge ?? ('__TAURI_INTERNALS__' in window ? nativeCaptureSource : undefined)
const available = ref(false)
const loading = ref(Boolean(bridge))
const pending = ref(false)
const error = ref('')
const outcome = ref<'selected' | 'cancelled'>()
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
const text = computed(() => props.locale === 'ru' ? {
  title: 'Экран для захвата', help: 'Выберите монитор для Области, Экрана и Повтора. При отмене сохранится прежний выбор.',
  choose: 'Выбрать экран', choosing: 'Выбор экрана…', checking: 'Проверка доступа к экрану…', retry: 'Повторить проверку',
  selected: 'Экран для захвата выбран.', cancelled: 'Выбор отменён. Экран не изменён.', busy: 'Завершите текущий захват и повторите выбор экрана.',
} : {
  title: 'Capture display', help: 'Choose the monitor for Area, Screen and Repeat. Cancelling keeps the previous selection.',
  choose: 'Choose display', choosing: 'Choosing display…', checking: 'Checking screen access…', retry: 'Check again',
  selected: 'Capture display selected.', cancelled: 'Selection cancelled. The display is unchanged.', busy: 'Finish the current capture before choosing a display.',
})

async function load(): Promise<void> {
  if (!bridge) return
  loading.value = true
  error.value = ''
  try {
    const supported = await bridge.available()
    if (!disposed) available.value = supported
  } catch (cause) {
    if (!disposed) error.value = settingsError(cause)
  } finally {
    if (!disposed) loading.value = false
  }
}

async function select(): Promise<void> {
  if (!bridge || pending.value) return
  pending.value = true
  error.value = ''
  outcome.value = undefined
  try {
    const selected = await bridge.select()
    if (!disposed) outcome.value = selected ? 'selected' : 'cancelled'
  } catch (cause) {
    if (!disposed) error.value = typeof cause === 'object' && cause && 'code' in cause && cause.code === 'busy'
      ? text.value.busy : settingsError(cause)
  } finally {
    if (!disposed) pending.value = false
  }
}
onMounted(load)
</script>

<template>
  <section
    v-if="loading || available || error"
    :aria-label="text.title"
    class="cs-settings-card"
  >
    <h3>{{ text.title }}</h3>
    <p v-if="loading" role="status">{{ text.checking }}</p>
    <template v-else-if="available">
      <p class="cs-settings-muted">{{ text.help }}</p>
      <button
        :disabled="pending"
        :aria-busy="pending"
        @click="select"
      >
        {{ pending ? text.choosing : text.choose }}
      </button>
      <p v-if="outcome" role="status">{{ text[outcome] }}</p>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="error && !available" @click="load">{{ text.retry }}</button>
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
</style>
