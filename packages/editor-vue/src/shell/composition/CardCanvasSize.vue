<script setup lang="ts">
import { useId } from 'vue'
import type { CompositionSettings } from '@cute-screen/editor-renderer'
import CardNumber from './CardNumber.vue'

type Layout = CompositionSettings['layout']
const props = defineProps<{ value: Layout; locale: 'ru' | 'en'; disabled: boolean }>()
const emit = defineEmits<{ change: [value: Layout]; preview: [value: Layout]; cancel: [] }>()
const group = useId()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
const ratios = ['1:1', '4:5', '9:16', '16:9', '1.91:1']
function mode(value: Layout['mode']): void {
  emit('cancel')
  emit('change', { ...props.value, mode: value })
}
function dimension(
  key: 'width' | 'height',
  value: number,
  preview = false,
): void {
  const next = { ...props.value, [key]: value }
  if (preview) emit('preview', next)
  else emit('change', next)
}
function ratioHeight(ratio: string): number {
  const [width, height] = ratio.split(':').map(Number)
  return Math.round(props.value.width * height! / width!)
}
function ratioShape(ratio: string) {
  const [width, height] = ratio.split(':').map(Number)
  const factor = 22 / Math.max(width!, height!)
  return { width: `${width! * factor}px`, height: `${height! * factor}px` }
}
function chooseRatio(ratio: string): void {
  if (props.disabled || ratioHeight(ratio) > 32768) return
  emit('cancel')
  dimension('height', ratioHeight(ratio))
}
</script>
<template>
  <section class="cs-canvas-size" :aria-label="text('Размер холста', 'Canvas size')">
    <h3 class="cs-composition-section-heading">{{ text('Размер холста', 'Canvas size') }}</h3>
    <div
      class="cs-canvas-modes"
      role="radiogroup"
      :aria-label="text('Размер холста', 'Canvas size')"
    >
      <label
        v-for="(label, kind) in { auto: text('По снимку', 'Fit screenshot'), fixed: text('Свой размер', 'Set size') }"
        :key="kind"
        class="cs-canvas-mode-option"
        :data-canvas-size="kind"
      >
        <input
          type="radio"
          :name="group"
          :value="kind"
          :aria-label="label"
          :checked="value.mode === kind"
          :disabled="disabled"
          @change="mode(kind)"
        />
        <span class="cs-canvas-mode-choice">{{ label }}</span>
      </label>
    </div>
    <p v-if="value.mode === 'auto'" class="cs-canvas-dimension-hint">{{ text('Холст подстраивается под снимок и поля', 'Canvas follows the screenshot and padding') }}</p>
    <template v-if="value.mode === 'fixed'">
      <p class="cs-canvas-dimension-hint">{{ text('Размер готового изображения в пикселях', 'Output image size in pixels') }}</p>
      <div class="cs-card-field-pair">
        <CardNumber
          v-for="key in ['width', 'height'] as const"
          :key="key"
          :label="key === 'width' ? text('Ширина', 'Width') : text('Высота', 'Height')"
          :value="value[key]"
          :min="1"
          :max="32768"
          :disabled="disabled"
          @change="dimension(key, $event)"
          @preview="dimension(key, $event, true)"
          @cancel="emit('cancel')"
        />
      </div>
      <div
        class="cs-canvas-ratios"
        role="group"
        :aria-label="text('Пропорции холста', 'Canvas aspect ratio')"
      >
        <button
          v-for="ratio in ratios"
          :key="ratio"
          type="button"
          data-geometry-preset
          :disabled="disabled || ratioHeight(ratio) > 32768"
          :aria-pressed="value.height === ratioHeight(ratio)"
          @click="chooseRatio(ratio)"
        >
          <span
            class="cs-canvas-ratio-shape"
            :style="ratioShape(ratio)"
            aria-hidden="true"
          /><span>{{ ratio }}</span>
        </button>
      </div>
    </template>
  </section>
</template>
