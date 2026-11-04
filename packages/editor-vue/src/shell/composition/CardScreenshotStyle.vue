<script setup lang="ts">
import {
  computed,
  shallowRef,
  watch,
} from 'vue'
import type { CompositionSettings } from '@cute-screen/editor-renderer'
import NumericControl from '../ui/NumericControl.vue'
import CardFramePreview from './CardFramePreview.vue'

const props = defineProps<{ value: CompositionSettings; locale: 'ru' | 'en'; disabled: boolean }>()
const emit = defineEmits<{ change: [value: CompositionSettings]; preview: [value: CompositionSettings]; cancel: [] }>()
const scaleDraft = shallowRef<number>()
const radiusDraft = shallowRef<number>()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
const framed = computed(() => props.value.frame.kind !== 'none')
const fixedCorners = computed(() => props.value.frame.kind === 'phone' || (
  props.value.frame.kind === 'browser' && props.value.frame.browserStyle && props.value.frame.browserStyle !== 'modern'
))
const scaleLabel = computed(() => framed.value ? text('Размер с рамкой', 'Framed size') : text('Размер снимка', 'Screenshot size'))
const radiusLabel = computed(() => framed.value ? text('Углы рамки', 'Frame corners') : text('Углы снимка', 'Screenshot corners'))
const scales = [75, 100, 125]
const radii = computed(() => [
  { value: 0, label: text('Прямые', 'Square') },
  { value: 16, label: text('Мягкие', 'Soft') },
  { value: 40, label: text('Круглые', 'Round') },
])
watch(() => props.value, () => {
  scaleDraft.value = undefined
  radiusDraft.value = undefined
})
function cancel(): void {
  scaleDraft.value = undefined
  radiusDraft.value = undefined
  emit('cancel')
}
function scale(
  value: number,
  preview = false,
): void {
  const next = { ...props.value, layout: { ...props.value.layout, scale: value / 100 } }
  scaleDraft.value = preview ? value : undefined
  if (preview) emit('preview', next)
  else emit('change', next)
}
function radius(
  value: number,
  preview = false,
): void {
  const next = { ...props.value, radius: value }
  radiusDraft.value = preview ? value : undefined
  if (preview) emit('preview', next)
  else emit('change', next)
}
</script>
<template>
  <div class="cs-screenshot-style">
    <section data-composition-scale class="cs-screenshot-style-group">
      <div class="cs-screenshot-control-row">
        <span class="cs-size-preview" aria-hidden="true"><span :style="{ transform: `scale(${(scaleDraft ?? Math.round(value.layout.scale * 100)) / 100})` }" /></span>
        <NumericControl
          :label="scaleLabel"
          :value="Math.round(value.layout.scale * 100)"
          :min="1"
          :max="1600"
          :step="1"
          unit="%"
          :locale="locale"
          :disabled="disabled"
          @commit="scale"
          @preview="scale($event, true)"
          @cancel="cancel"
        />
      </div>
      <p>
        {{ framed
          ? text('Меняет размер снимка вместе с рамкой. 100% — вписать между полями.', 'Resizes the screenshot and its frame. 100% fits between the padding.')
          : text('Меняет размер снимка внутри холста. 100% — вписать между полями.', 'Resizes the screenshot inside the canvas. 100% fits between the padding.') }}
      </p>
      <div
        class="cs-screenshot-presets"
        role="group"
        :aria-label="scaleLabel"
      >
        <button
          v-for="amount in scales"
          :key="amount"
          type="button"
          data-geometry-preset
          :disabled="disabled"
          :aria-pressed="(scaleDraft ?? Math.round(value.layout.scale * 100)) === amount"
          @click="cancel(); scale(amount)"
        >
          {{ amount }}%
        </button>
      </div>
    </section>
    <section data-composition-radius class="cs-screenshot-style-group">
      <template v-if="!fixedCorners">
        <div class="cs-screenshot-control-row">
          <span
            class="cs-corner-preview"
            aria-hidden="true"
            :style="{ borderRadius: `${(radiusDraft ?? value.radius) / 3}px` }"
          />
          <NumericControl
            :label="radiusLabel"
            :value="value.radius"
            :min="0"
            :max="4096"
            :step="1"
            unit="px"
            :locale="locale"
            :disabled="disabled"
            @commit="radius"
            @preview="radius($event, true)"
            @cancel="cancel"
          />
        </div>
        <p>
          {{ framed
            ? text('Закругляет внешние углы рамки. 0 px — прямые углы.', 'Rounds the frame’s outer corners. 0 px keeps them square.')
            : text('Закругляет углы снимка. 0 px — прямые углы.', 'Rounds the screenshot’s corners. 0 px keeps them square.') }}
        </p>
        <div
          class="cs-screenshot-presets"
          role="group"
          :aria-label="radiusLabel"
        >
          <button
            v-for="preset in radii"
            :key="preset.value"
            type="button"
            data-geometry-preset
            :disabled="disabled"
            :aria-pressed="(radiusDraft ?? value.radius) === preset.value"
            @click="cancel(); radius(preset.value)"
          >
            {{ preset.label }}
          </button>
        </div>
      </template>
      <div v-else class="cs-fixed-corners">
        <CardFramePreview :frame="value.frame" />
        <div>
          <strong>{{ radiusLabel }}</strong><p>
            {{ value.frame.kind === 'phone'
              ? text('Углы задаёт модель телефона в разделе «Рамка».', 'Corners follow the phone model in Frame settings.')
              : text('У выбранной ретрорамки прямые углы.', 'The selected retro frame has square corners.') }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
