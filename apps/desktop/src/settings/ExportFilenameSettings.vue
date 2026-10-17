<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from 'vue'
import type { ExportFilenameBridge } from './export-filename-contracts'
import type { ExportFilenameSettings } from '../generated/desktop-ipc'
import { nativeExportFilename } from '../platform/tauri/export-filename-adapter'
import { settingsError } from './contracts'
import { filenameLabels } from './export-filename-labels'
import './export-filename.css'

const props = defineProps<{ locale: 'ru' | 'en'; bridge?: ExportFilenameBridge }>()
const bridge = props.bridge ?? ('__TAURI_INTERNALS__' in window ? nativeExportFilename : undefined)
const text = computed(() => filenameLabels[props.locale])
const id = useId()
const pattern = ref('')
const savedPattern = ref('')
const defaultPattern = ref('')
const savedPreview = ref('')
const preview = ref('')
const loading = ref(false)
const saving = ref(false)
const checking = ref(false)
const error = ref('')
const validation = ref('')
const previewFailed = ref(false)
const message = ref(false)
const validatedPattern = ref('')
let revision = 0
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
const changed = computed(() => pattern.value !== savedPattern.value)
const canSave = computed(() =>
  changed.value &&
  !loading.value &&
  !saving.value &&
  !checking.value &&
  validatedPattern.value === pattern.value &&
  !validation.value)

function errorText(cause: unknown): string {
  const detail = settingsError(cause)
  return Object.hasOwn(text.value, detail) ? text.value[detail as keyof typeof text.value] : detail
}

function apply(settings: ExportFilenameSettings): void {
  savedPattern.value = settings.pattern
  defaultPattern.value = settings.defaultPattern
  savedPreview.value = settings.preview
  pattern.value = settings.pattern
  preview.value = settings.preview
  validatedPattern.value = settings.pattern
}

async function load(): Promise<void> {
  if (!bridge || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const settings = await bridge.load()
    if (!disposed) apply(settings)
  } catch (cause) {
    if (!disposed) error.value = settingsError(cause)
  } finally {
    loading.value = false
  }
}

async function check(
  value: string,
  current: number,
): Promise<void> {
  if (!bridge) return
  try {
    const result = await bridge.preview(value)
    if (disposed || current !== revision) return
    preview.value = result
    validatedPattern.value = value
  } catch (cause) {
    if (disposed || current !== revision) return
    validation.value = settingsError(cause)
    previewFailed.value = !(
      typeof cause === 'object' &&
      cause &&
      'code' in cause &&
      cause.code === 'invalidFilenamePattern'
    )
  } finally {
    if (current === revision) checking.value = false
  }
}

function schedulePreview(): void {
  clearTimeout(timer)
  const current = ++revision
  validation.value = ''
  previewFailed.value = false
  error.value = ''
  message.value = false
  if (!changed.value) {
    checking.value = false
    preview.value = savedPreview.value
    validatedPattern.value = savedPattern.value
    return
  }
  checking.value = true
  preview.value = ''
  validatedPattern.value = ''
  timer = setTimeout(() => {
    void check(pattern.value, current)
  }, 150)
}

async function save(): Promise<void> {
  if (!bridge || !canSave.value) return
  saving.value = true
  error.value = ''
  try {
    const settings = await bridge.save(pattern.value)
    if (!disposed) {
      apply(settings)
      message.value = true
    }
  } catch (cause) {
    if (!disposed) error.value = settingsError(cause)
  } finally {
    saving.value = false
  }
}

function cancel(): void {
  pattern.value = savedPattern.value
  schedulePreview()
}

watch(pattern, schedulePreview)
onMounted(load)
onBeforeUnmount(() => {
  disposed = true
  revision += 1
  clearTimeout(timer)
})
</script>

<template>
  <section
    class="cs-export-filename"
    :aria-label="text.title"
    :aria-busy="loading || saving"
  >
    <h3>{{ text.title }}</h3>
    <p v-if="!bridge" class="cs-settings-muted">{{ text.unavailable }}</p>
    <template v-else>
      <label :for="id">{{ text.pattern }}</label>
      <div class="cs-export-filename-input">
        <input
          :id="id"
          v-model="pattern"
          type="text"
          spellcheck="false"
          autocomplete="off"
          :disabled="loading || saving || !savedPattern"
          :aria-invalid="!!validation"
          :aria-describedby="`${id}-help ${id}-preview`"
          @keydown.esc.prevent.stop="cancel"
        />
        <span aria-hidden="true">.png</span>
      </div>
      <p :id="`${id}-help`" class="cs-settings-muted">{{ text.help }}</p>
      <p
        :id="`${id}-preview`"
        class="cs-export-filename-preview"
        role="status"
      >
        {{ loading ? text.loading : checking ? text.checking : preview }}
      </p>
      <p v-if="validation" role="alert">
        {{ errorText(validation) }}
        <button
          v-if="previewFailed"
          :disabled="checking"
          @click="schedulePreview"
        >
          {{ text.retry }}
        </button>
      </p>
      <p v-if="error" role="alert">
        {{ errorText(error) }}
        <button
          v-if="!savedPattern"
          :disabled="loading"
          @click="load"
        >
          {{ text.retry }}
        </button>
      </p>
      <div class="cs-settings-row-actions">
        <button :disabled="!canSave" @click="save">{{ text.save }}</button>
        <button :disabled="!changed || saving || loading" @click="cancel">{{ text.cancel }}</button>
        <button
          :disabled="loading || saving || !defaultPattern || pattern === defaultPattern"
          @click="pattern = defaultPattern"
        >
          {{ text.reset }}
        </button>
      </div>
      <p v-if="message" role="status">{{ text.saved }}</p>
    </template>
  </section>
</template>
