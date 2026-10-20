<script setup lang="ts">
import { computed } from 'vue'
import {
  createCardShadowOptions,
  type CompositionSettings,
  type CardShadowOptions,
} from '@cute-screen/editor-renderer'
import NumericControl from '../ui/NumericControl.vue'
import CardNumber from './CardNumber.vue'
import CardColor from './CardColor.vue'
const props = defineProps<{ value: CompositionSettings; locale: 'ru' | 'en'; disabled: boolean }>()
const emit = defineEmits<{ change: [value: CompositionSettings]; preview: [value: CompositionSettings]; cancel: [] }>()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
const options = computed(() => props.value.shadowOptions ?? createCardShadowOptions())
const presets = computed(() => [
  { strength: 0, size: 1, label: text('Нет', 'None') },
  { strength: 0.2, size: 0.75, label: text('Лёгкая', 'Soft') },
  { strength: 0.45, size: 1, label: text('Средняя', 'Medium') },
  { strength: 0.75, size: 1.5, label: text('Объёмная', 'Strong') },
])
function update(
  patch: Partial<CardShadowOptions>,
  preview = false,
): void {
  const next = { ...props.value, shadowOptions: { ...options.value, ...patch } }
  if (preview) emit('preview', next)
  else emit('change', next)
}
function choose(
  strength: number,
  size: number,
): void {
  emit('change', { ...props.value, shadow: strength,
    ...(strength === 0 ? {} : { shadowOptions: { ...createCardShadowOptions(), size } }) })
}
function selected(
  strength: number,
  size: number,
): boolean {
  const current = options.value
  return props.value.shadow === strength && (strength === 0 || (
    current.size === size &&
    current.softness === 1 &&
    current.spread === 0 &&
    current.offset.x === 0 &&
    current.offset.y === 0 &&
    current.color.red === 0 &&
    current.color.green === 0 &&
    current.color.blue === 0 &&
    current.color.alpha === 1
  ))
}
</script>
<template>
  <div class="cs-card-layout-group cs-card-shadow" @keydown.esc.stop>
    <div class="cs-card-row-heading">{{ text('Тень снимка', 'Screenshot shadow') }}</div>
    <div
      class="cs-card-shadow-presets"
      role="group"
      :aria-label="text('Пресеты тени', 'Shadow presets')"
    >
      <button
        v-for="preset in presets"
        :key="preset.strength"
        type="button"
        :aria-pressed="selected(preset.strength, preset.size)"
        @click="choose(preset.strength, preset.size)"
      >
        <span
          class="cs-card-shadow-preview"
          aria-hidden="true"
          :style="{ '--shadow-strength': preset.strength, '--shadow-size': preset.size }"
        ><span class="cs-card-shadow-sample" /></span>
        <span>{{ preset.label }}</span>
      </button>
    </div>
    <div class="cs-card-shadow-controls">
      <NumericControl
        :label="text('Плотность', 'Shadow strength')"
        :compact-label="text('Плотность', 'Opacity')"
        :value="Math.round(value.shadow * 100)"
        :min="0"
        :max="100"
        :step="1"
        unit="%"
        :slider="true"
        :locale="locale"
        :disabled="disabled"
        @commit="emit('change', { ...value, shadow: $event / 100 })"
        @preview="emit('preview', { ...value, shadow: $event / 100 })"
        @cancel="emit('cancel')"
      />
      <NumericControl
        :label="text('Размер', 'Shadow size')"
        :compact-label="text('Размер', 'Size')"
        :value="Math.round(options.size * 100)"
        :min="25"
        :max="400"
        :step="1"
        unit="%"
        :slider="true"
        :locale="locale"
        :disabled="disabled"
        @commit="update({ size: $event / 100 })"
        @preview="update({ size: $event / 100 }, true)"
        @cancel="emit('cancel')"
      />
    </div>
    <details class="cs-card-position-details cs-card-shadow-details">
      <summary>{{ text('Параметры тени', 'Advanced shadow') }}</summary>
      <div class="cs-card-field-pair">
        <CardNumber
          :label="text('Мягкость %', 'Softness %')"
          :value="Math.round(options.softness * 100)"
          :min="10"
          :max="200"
          @change="update({ softness: $event / 100 })"
          @preview="update({ softness: $event / 100 }, true)"
          @cancel="emit('cancel')"
        />
        <CardNumber
          :label="text('Расширение px', 'Spread px')"
          :value="options.spread"
          :min="-128"
          :max="256"
          @change="update({ spread: $event })"
          @preview="update({ spread: $event }, true)"
          @cancel="emit('cancel')"
        />
        <CardNumber
          v-for="axis in ['x', 'y'] as const"
          :key="axis"
          :label="text('Сдвиг', 'Shift') + ' ' + axis.toUpperCase() + ' px'"
          :value="options.offset[axis]"
          :min="-1024"
          :max="1024"
          @change="update({ offset: { ...options.offset, [axis]: $event } })"
          @preview="update({ offset: { ...options.offset, [axis]: $event } }, true)"
          @cancel="emit('cancel')"
        />
      </div>
      <CardColor
        :label="text('Цвет тени', 'Shadow color')"
        :value="options.color"
        :locale="locale"
        :disabled="disabled"
        :show-opacity="false"
        @change="update({ color: $event })"
      />
      <button type="button" @click="update(createCardShadowOptions())">{{ text('Сбросить параметры', 'Reset shadow settings') }}</button>
      <p class="cs-card-shadow-hint">{{ text('Для широкой тени увеличьте поля вокруг снимка.', 'Increase screenshot padding to leave room for a wider shadow.') }}</p>
    </details>
  </div>
</template>
