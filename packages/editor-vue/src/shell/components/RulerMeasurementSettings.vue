<script setup lang="ts">
import type { ContextToolbarSchema } from '../types'
import { useRulerMeasurement } from '../ui/ruler-measurement'
const props = defineProps<{
  schema: ContextToolbarSchema
  locale: 'en' | 'ru'
  disabled: boolean
}>()
const emit = defineEmits<{
  change: [value: string]
  action: [id: string]
}>()
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const dimension = (value: number) => new Intl.NumberFormat(props.locale, {
  maximumFractionDigits: 2,
  useGrouping: false,
}).format(value)
const { modes, mode, length, localized, settings } = useRulerMeasurement(() => props.schema, () => props.locale)
</script>

<template>
  <div
    class="cs-ruler-modes"
    role="group"
    :aria-label="text('Measurement units', 'Единицы измерения')"
  >
    <button
      v-for="option in modes"
      :key="option.value"
      type="button"
      :disabled="disabled"
      :aria-pressed="mode === option.value"
      :data-ruler-mode="option.value"
      @click="emit('change', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
  <small v-if="settings.measurementArea" class="cs-ruler-reference">
    {{ settings.measurementArea.cropped ? text('Crop area', 'Область обрезки') : text('Canvas', 'Холст') }}:
    {{ dimension(settings.measurementArea.width) }} × {{ dimension(settings.measurementArea.height) }} px
  </small>
  <div v-if="settings.measurement" class="cs-tool-measurement">
    <div class="cs-ruler-reading">
      <span>{{ text('Length', 'Длина') }}</span>
      <output>{{ length }}</output>
      <button
        type="button"
        data-settings-action="rulerCopyLength"
        @click="emit('action', 'rulerCopyLength')"
      >
        {{ text('Copy length', 'Скопировать длину') }}
      </button>
    </div>
    <div class="cs-ruler-reading">
      <span>{{ text('Angle', 'Угол') }}</span>
      <output>{{ localized(settings.measurement.angle) }}</output>
      <button
        type="button"
        data-settings-action="rulerCopyAngle"
        @click="emit('action', 'rulerCopyAngle')"
      >
        {{ text('Copy angle', 'Скопировать угол') }}
      </button>
    </div>
  </div>
  <small>{{ text('Shift: 45° steps. Alt: configured angle step while drawing or moving an endpoint. Changing the step keeps the current measurement.', 'Shift — шаг 45°. Alt — настраиваемый шаг при рисовании и перемещении конца. Изменение шага сохраняет текущее измерение.') }}</small>
</template>
