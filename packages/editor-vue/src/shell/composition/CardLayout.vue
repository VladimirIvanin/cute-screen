<script setup lang="ts">
import type { CompositionSettings } from '@cute-screen/editor-renderer'
import CardNumber from './CardNumber.vue'
const props = defineProps<{ value: CompositionSettings; locale: 'ru' | 'en'; disabled: boolean }>()
const emit = defineEmits<{ change: [value: CompositionSettings]; preview: [value: CompositionSettings]; cancel: [] }>()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
function layout(
  key: string,
  value: unknown,
  preview = false,
): void {
  const next = { ...props.value, layout: { ...props.value.layout, [key]: value } }
  if (preview) emit('preview', next)
  else emit('change', next)
}
function inset(
  side: string,
  value: number,
  preview = false,
): void {
  const current = props.value.layout.insets
  const sides = current.linked ? { top: value, right: value, bottom: value, left: value } : { [side]: value }
  layout('insets', { ...current, ...sides }, preview)
}
function ratio(value: string): void {
  const [a, b] = value.split(':').map(Number)
  layout('height', Math.round(props.value.layout.width * b! / a!))
}
</script>
<template>
  <fieldset :disabled="disabled">
    <label>{{ text('Размер', 'Size') }}<select :value="value.layout.mode" @change="layout('mode', ($event.target as HTMLSelectElement).value)"><option value="auto">{{ text('По содержимому', 'Fit content') }}</option><option value="fixed">{{ text('Заданный размер', 'Fixed size') }}</option></select></label>
    <template v-if="value.layout.mode === 'fixed'">
      <CardNumber
        v-for="key in ['width', 'height'] as const"
        :key="key"
        :label="key === 'width' ? text('Ширина', 'Width') : text('Высота', 'Height')"
        :value="value.layout[key]"
        :min="1"
        :max="32768"
        @change="layout(key, $event)"
      />
      <label>{{ text('Пропорции', 'Aspect ratio') }}<select value="" @change="ratio(($event.target as HTMLSelectElement).value)"><option value="" disabled>{{ text('Выбрать', 'Choose') }}</option><option v-for="r in ['1:1', '4:5', '9:16', '16:9', '1.91:1']" :key="r">{{ r }}</option></select></label>
    </template>
    <label><input
      type="checkbox"
      :checked="value.layout.insets.linked"
      @change="layout('insets', { ...value.layout.insets, linked: ($event.target as HTMLInputElement).checked })"
    />{{ text('Связать поля', 'Link insets') }}</label>
    <label>{{ text('Единицы полей', 'Inset units') }}<select :value="value.layout.insets.unit" @change="layout('insets', { ...value.layout.insets, unit: ($event.target as HTMLSelectElement).value })"><option value="percent">%</option><option value="px">px</option></select></label>
    <CardNumber
      v-for="(label, side) in { top: text('Сверху', 'Top'), right: text('Справа', 'Right'), bottom: text('Снизу', 'Bottom'), left: text('Слева', 'Left') }"
      :key="side"
      :label="label"
      :value="value.layout.insets[side]"
      :min="0"
      :max="value.layout.insets.unit === 'px' ? 8192 : 200"
      @change="inset(side, $event)"
      @preview="inset(side, $event, true)"
      @cancel="emit('cancel')"
    />
    <div class="cs-card-alignment" :aria-label="text('Выравнивание', 'Alignment')">
      <button
        v-for="n in 9"
        :key="n"
        type="button"
        :aria-label="`${text('Позиция', 'Position')} ${n}`"
        :aria-pressed="
          value.layout.alignment.x === (n - 1) % 3 / 2 &&
            value.layout.alignment.y === Math.floor((n - 1) / 3) / 2
        "
        @click="layout('alignment', { x: (n - 1) % 3 / 2, y: Math.floor((n - 1) / 3) / 2 })"
      >
        •
      </button>
    </div>
    <CardNumber
      :label="text('Масштаб %', 'Scale %')"
      :value="Math.round(value.layout.scale * 100)"
      :min="1"
      :max="1600"
      @change="layout('scale', $event / 100)"
      @preview="layout('scale', $event / 100, true)"
      @cancel="emit('cancel')"
    />
    <CardNumber
      v-for="axis in ['x', 'y'] as const"
      :key="axis"
      :label="`${text('Смещение', 'Offset')} ${axis.toUpperCase()}`"
      :value="value.layout.offset[axis]"
      @change="layout('offset', { ...value.layout.offset, [axis]: $event })"
    />
    <CardNumber
      :label="text('Скругление', 'Corners')"
      :value="value.radius"
      :min="0"
      :max="4096"
      @change="emit('change', { ...value, radius: $event })"
      @preview="emit('preview', { ...value, radius: $event })"
      @cancel="emit('cancel')"
    />
    <CardNumber
      :label="text('Тень %', 'Shadow %')"
      :value="Math.round(value.shadow * 100)"
      :min="0"
      :max="100"
      @change="emit('change', { ...value, shadow: $event / 100 })"
      @preview="emit('preview', { ...value, shadow: $event / 100 })"
      @cancel="emit('cancel')"
    />
  </fieldset>
</template>
