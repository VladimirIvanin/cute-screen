<script setup lang="ts">
import {
  nextTick,
  ref,
  watch,
} from 'vue'
import type { MaterialRecord } from '../../materials'
import { UiIcon } from '../icon'
import CardLogoPreview from './CardLogoPreview.vue'

const props = defineProps<{
  materials: readonly MaterialRecord[]
  locale: 'ru' | 'en'
  disabled: boolean
  kind: 'preset' | 'background' | 'logo'
  loading?: boolean
}>()
const emit = defineEmits<{ remove: [id: string]; apply: [record: MaterialRecord] }>()
const removeId = ref<string>()
let trigger: HTMLButtonElement | undefined
const cancelButton = ref<HTMLButtonElement>()
const list = ref<HTMLElement>()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
async function confirm(
  id: string,
  event: Event,
): Promise<void> {
  trigger = event.currentTarget as HTMLButtonElement
  removeId.value = id
  await nextTick()
  cancelButton.value?.focus()
}
async function cancel(): Promise<void> {
  removeId.value = undefined
  await nextTick()
  trigger?.focus()
}
function remove(): void {
  if (!removeId.value || props.disabled) return
  emit('remove', removeId.value)
}
watch(() => props.materials, async (items) => {
  if (!removeId.value || items.some((item) => item.id === removeId.value)) return
  removeId.value = undefined
  await nextTick()
  const target = list.value?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? list.value
  target?.focus()
})
</script>
<template>
  <div
    ref="list"
    class="cs-card-materials"
    :class="{ 'cs-logo-library': kind === 'logo' }"
    tabindex="-1"
    :aria-busy="loading"
  >
    <p v-if="!loading && !materials.length" class="cs-card-library-empty">
      {{ kind === 'preset'
        ? text('Сохраните оформление, чтобы применять его к другим снимкам.', 'Save an appearance to reuse it on other screenshots.')
        : kind === 'background'
          ? text('Здесь появятся сохранённые фоны и загруженные картинки.', 'Saved backgrounds and imported images appear here.')
          : text('Здесь появятся загруженные логотипы.', 'Imported logos appear here.') }}
    </p>
    <div
      v-for="item in materials"
      :key="item.id"
      class="cs-card-material"
    >
      <button
        type="button"
        :disabled="disabled"
        :aria-label="item.title"
        :title="item.title"
        @click="emit('apply', item)"
      >
        <CardLogoPreview
          v-if="kind === 'logo'"
          :value-json="item.valueJson"
          :locale="locale"
          :label="`${text('Логотип', 'Logo')} ${item.title}`"
        />
        <span>{{ item.title }}</span>
      </button>
      <button
        type="button"
        :disabled="disabled"
        :aria-label="`${text('Удалить из сохранённого', 'Remove saved item')} ${item.title}`"
        @click="confirm(item.id, $event)"
      >
        <UiIcon name="trash" />
      </button>
    </div>
    <div
      v-if="removeId"
      class="cs-card-material-confirm"
      role="group"
      :aria-label="text('Удаление из сохранённого', 'Remove saved item')"
      @keydown.esc.stop.prevent="cancel"
    >
      <p>{{ text('Удалить из сохранённого? В уже оформленных снимках всё сохранится.', 'Remove saved item? Existing screenshots keep their appearance.') }}</p>
      <div class="cs-card-buttons">
        <button
          type="button"
          :disabled="disabled"
          @click="remove"
        >
          {{ text('Удалить', 'Remove') }}
        </button>
        <button
          ref="cancelButton"
          type="button"
          @click="cancel"
        >
          {{ text('Отмена', 'Cancel') }}
        </button>
      </div>
    </div>
  </div>
</template>
