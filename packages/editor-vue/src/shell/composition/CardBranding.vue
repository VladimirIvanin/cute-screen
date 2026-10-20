<script setup lang="ts">
import {
  computed,
  watch,
} from 'vue'
import {
  createCardBranding,
  type CardBranding,
} from '@cute-screen/editor-renderer'
import { UiIcon } from '../icon'
import CardBrandingEditor from './CardBrandingEditor.vue'

const props = defineProps<{ value: readonly CardBranding[]; locale: 'ru' | 'en'; disabled: boolean; selected?: string | undefined; canImport: boolean }>()
const emit = defineEmits<{
  change: [value: readonly CardBranding[]]
  preview: [value: readonly CardBranding[]]
  cancel: []
  select: [id: string]
  import: []
}>()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
const active = computed(() => props.value.find((block) => block.id === props.selected) ?? props.value[0])
const activeIndex = computed(() => props.value.findIndex((block) => block.id === active.value?.id))
watch([() => active.value?.id, () => props.selected], ([id, selected]) => {
  if (id && id !== selected) emit('select', id)
}, { immediate: true })
function add(): void {
  const block = createCardBranding(crypto.randomUUID(), new Date().getFullYear())
  emit('change', [...props.value, block])
  emit('select', block.id)
}
function remove(): void {
  const remaining = props.value.filter((block) => block.id !== active.value?.id)
  const next = remaining[Math.min(activeIndex.value, remaining.length - 1)]
  emit('change', remaining)
  if (next) emit('select', next.id)
}
function change(
  value: CardBranding,
  preview = false,
): void {
  const next = props.value.map((block) => block.id === value.id ? value : block)
  if (preview) emit('preview', next)
  else emit('change', next)
}
</script>
<template>
  <fieldset class="cs-branding" :disabled="disabled">
    <p v-if="!value.length">{{ text('Добавьте копирайт, название канала, источник или логотип.', 'Add a copyright, channel name, source or logo.') }}</p>
    <button
      class="cs-brand-add"
      type="button"
      @click="add"
    >
      <UiIcon name="plus" />{{ text('Добавить подпись', 'Add signature') }}
    </button>
    <div
      v-if="value.length > 1"
      class="cs-brand-list"
      role="group"
      :aria-label="text('Выбор подписи', 'Choose signature')"
    >
      <button
        v-for="(block, index) in value"
        :key="block.id"
        type="button"
        :data-brand-id="block.id"
        :aria-pressed="active?.id === block.id"
        :title="block.text || `${text('Подпись', 'Signature')} ${index + 1}`"
        @click="emit('select', block.id)"
      >
        <span>{{ index + 1 }}</span><span>{{ block.text || text('Без текста', 'No text') }}</span>
      </button>
    </div>
    <section
      v-if="active"
      :data-active-brand="active.id"
      :aria-label="text('Редактор подписи', 'Signature editor')"
    >
      <div class="cs-brand-heading">
        <strong>{{ text('Подпись', 'Signature') }} {{ activeIndex + 1 }}</strong>
        <button
          type="button"
          :aria-label="text('Удалить подпись', 'Remove signature')"
          :title="text('Удалить подпись', 'Remove signature')"
          @click="remove"
        >
          <UiIcon name="trash" />
        </button>
      </div>
      <CardBrandingEditor
        :key="active.id"
        :value="active"
        :locale="locale"
        :disabled="disabled"
        :can-import="canImport"
        @change="change"
        @preview="change($event, true)"
        @cancel="emit('cancel')"
        @import="emit('select', active.id); emit('import')"
      />
    </section>
  </fieldset>
</template>
