<script setup lang="ts">
import { useId } from 'vue'
import {
  PHONE_MODELS,
  BROWSER_STYLES,
  type CardFrame,
} from '@cute-screen/editor-renderer'
import CardFramePreview from './CardFramePreview.vue'
const props = defineProps<{ value: CardFrame; locale: 'ru' | 'en' }>()
const emit = defineEmits<{ change: [value: CardFrame] }>()
const name = useId()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
function modelValue(id: string): CardFrame {
  const phone = PHONE_MODELS.find((model) => model.id === id)
  return phone ? { ...props.value, phoneModel: phone.id }
    : { ...props.value, browserStyle: BROWSER_STYLES.find((model) => model.id === id)!.id }
}
</script>
<template>
  <div
    v-if="value.kind === 'phone' || value.kind === 'browser'"
    class="cs-card-models"
    :class="{ 'is-phone': value.kind === 'phone' }"
    role="radiogroup"
    :aria-label="value.kind === 'phone' ? text('Модель телефона', 'Phone model') : text('Стиль браузера', 'Browser style')"
  >
    <label
      v-for="model in value.kind === 'phone' ? PHONE_MODELS : BROWSER_STYLES"
      :key="model.id"
      class="cs-card-frame-option"
    >
      <input
        type="radio"
        :name="name"
        :value="model.id"
        :checked="value.kind === 'phone' ? (value.phoneModel ?? 'iphone-island') === model.id : (value.browserStyle ?? 'modern') === model.id"
        @change="emit('change', modelValue(model.id))"
      />
      <span class="cs-card-frame-choice" :class="{ 'is-selected': value.kind === 'phone' ? (value.phoneModel ?? 'iphone-island') === model.id : (value.browserStyle ?? 'modern') === model.id }">
        <CardFramePreview :frame="modelValue(model.id)" />
        <span>{{ model[locale] }}</span>
      </span>
    </label>
  </div>
</template>
