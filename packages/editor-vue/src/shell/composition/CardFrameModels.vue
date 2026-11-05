<script setup lang="ts">
import {
  computed,
  useId,
} from 'vue'
import {
  PHONE_MODELS,
  BROWSER_STYLES,
  WINDOW_STYLES,
  frameStyle,
  type CardFrame,
} from '@cute-screen/editor-renderer'
import CardFramePreview from './CardFramePreview.vue'
const props = defineProps<{ value: CardFrame; locale: 'ru' | 'en' }>()
const emit = defineEmits<{ change: [value: CardFrame] }>()
const name = useId()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
const models = computed(() => props.value.kind === 'phone' ? PHONE_MODELS
  : props.value.kind === 'window' ? WINDOW_STYLES : BROWSER_STYLES)
const selected = computed(() => props.value.kind === 'phone' ? props.value.phoneModel ?? 'iphone-island' : frameStyle(props.value))
const label = computed(() => props.value.kind === 'phone' ? text('Модель телефона', 'Phone model')
  : props.value.kind === 'window' ? text('Стиль окна', 'Window style') : text('Стиль браузера', 'Browser style'))
function modelValue(id: string): CardFrame {
  const phone = PHONE_MODELS.find((model) => model.id === id)
  if (phone) return { ...props.value, phoneModel: phone.id }
  return props.value.kind === 'window'
    ? { ...props.value, windowStyle: WINDOW_STYLES.find((model) => model.id === id)!.id }
    : { ...props.value, browserStyle: BROWSER_STYLES.find((model) => model.id === id)!.id }
}
</script>
<template>
  <div
    v-if="value.kind === 'phone' || value.kind === 'browser' || value.kind === 'window'"
    class="cs-card-models"
    :class="{ 'is-phone': value.kind === 'phone' }"
    role="radiogroup"
    :aria-label="label"
  >
    <label
      v-for="model in models"
      :key="model.id"
      class="cs-card-frame-option"
    >
      <input
        type="radio"
        :name="name"
        :value="model.id"
        :checked="selected === model.id"
        @change="emit('change', modelValue(model.id))"
      />
      <span class="cs-card-frame-choice" :class="{ 'is-selected': selected === model.id }">
        <CardFramePreview :frame="modelValue(model.id)" />
        <span>{{ model[locale] }}</span>
      </span>
    </label>
  </div>
</template>
