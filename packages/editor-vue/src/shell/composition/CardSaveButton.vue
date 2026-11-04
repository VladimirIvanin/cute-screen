<script setup lang="ts">
import {
  nextTick,
  ref,
  watch,
} from 'vue'

const props = defineProps<{
  kind: 'preset' | 'gradient'
  locale: 'ru' | 'en'
  disabled: boolean
  pending: boolean
  error: string
  canSave: boolean
  active: boolean
}>()
const emit = defineEmits<{ save: [kind: 'preset' | 'gradient', title: string]; open: [] }>()
const open = ref(false)
const title = ref('')
const saved = ref(false)
const trigger = ref<HTMLButtonElement>()
const input = ref<HTMLInputElement>()
let submitted = false
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
async function begin(): Promise<void> {
  emit('open')
  saved.value = false
  open.value = true
  await nextTick()
  input.value?.focus()
}
async function close(): Promise<void> {
  if (props.pending) return
  open.value = false
  submitted = false
  await nextTick()
  trigger.value?.focus()
}
function save(): void {
  if (
    props.disabled ||
    !props.canSave ||
    !title.value.trim()
  ) return
  submitted = true
  emit('save', props.kind, title.value.trim())
}
watch(() => props.pending, (pending, previous) => {
  if (
    !previous ||
    pending ||
    !submitted
  ) return
  submitted = false
  if (!props.error) {
    title.value = ''
    saved.value = true
    void close()
  } else void nextTick(() => input.value?.focus())
})
watch(() => props.active, (active) => {
  if (!active) {
    open.value = false
    saved.value = false
    submitted = false
  }
})
</script>
<template>
  <div class="cs-card-save" :class="{ 'is-open': open }">
    <button
      v-show="!open"
      ref="trigger"
      type="button"
      :disabled="disabled || !canSave"
      :title="canSave ? undefined : text('Сохранение доступно в приложении', 'Saving is available in the desktop app')"
      @click="begin"
    >
      {{ kind === 'preset' ? text('Сохранить шаблон…', 'Save template…') : text('Сохранить этот фон…', 'Save this background…') }}
    </button>
    <form
      v-if="open"
      class="cs-card-save-form"
      :aria-label="kind === 'preset' ? text('Сохранение шаблона', 'Save template') : text('Сохранение фона', 'Save background')"
      @submit.prevent="save"
      @keydown.esc.stop.prevent="close"
    >
      <label>{{ kind === 'preset' ? text('Название шаблона', 'Template name') : text('Название фона', 'Background name') }}<input
        ref="input"
        v-model="title"
        class="cs-card-input"
        :disabled="disabled"
        maxlength="128"
        required
      /></label>
      <div class="cs-card-buttons">
        <button type="submit" :disabled="disabled || !canSave || !title.trim()">{{ pending ? text('Сохранение…', 'Saving…') : text('Сохранить', 'Save') }}</button>
        <button
          type="button"
          :disabled="pending"
          @click="close"
        >
          {{ text('Отмена', 'Cancel') }}
        </button>
      </div>
    </form>
    <p
      v-if="saved && !open"
      class="cs-card-save-status"
      role="status"
    >
      {{ kind === 'preset'
        ? text('Шаблон сохранён', 'Template saved')
        : text('Фон сохранён', 'Background saved') }}
    </p>
  </div>
</template>
