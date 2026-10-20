<script setup lang="ts">
import type { CardFrame } from '@cute-screen/editor-renderer'
import CardNumber from './CardNumber.vue'
import CardColor from './CardColor.vue'
const props = defineProps<{ value: CardFrame; locale: 'ru' | 'en'; disabled: boolean }>()
const emit = defineEmits<{ change: [value: CardFrame] }>()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
function patch(
  key: string,
  value: unknown,
): void {
  emit('change', { ...props.value, [key]: value })
}
</script>
<template>
  <fieldset :disabled="disabled">
    <label>{{ text('Рамка', 'Frame') }}<select :value="value.kind" @change="patch('kind', ($event.target as HTMLSelectElement).value)"><option
      v-for="(label, kind) in { none: text('Без рамки', 'None'), window: text('Окно', 'Window'), browser: text('Браузер', 'Browser'), phone: text('Телефон', 'Phone') }"
      :key="kind"
      :value="kind"
    >{{ label }}</option></select></label>
    <template v-if="value.kind !== 'none'">
      <label>{{ text('Тема рамки', 'Frame theme') }}<select :value="value.theme" @change="patch('theme', ($event.target as HTMLSelectElement).value)"><option value="light">{{ text('Светлая', 'Light') }}</option><option value="dark">{{ text('Тёмная', 'Dark') }}</option></select></label>
      <label v-if="value.kind !== 'phone'">{{ text('Заголовок', 'Title') }}<input
        class="cs-card-input"
        maxlength="16384"
        :value="value.title"
        @change="patch('title', ($event.target as HTMLInputElement).value)"
      /></label>
      <label v-if="value.kind === 'browser'">URL<input
        class="cs-card-input"
        maxlength="16384"
        :value="value.url"
        @change="patch('url', ($event.target as HTMLInputElement).value)"
      /></label>
    </template>
    <template v-if="value.kind === 'phone'">
      <label>{{ text('Ориентация', 'Orientation') }}<select :value="value.orientation" @change="patch('orientation', ($event.target as HTMLSelectElement).value)"><option value="portrait">{{ text('Вертикальная', 'Portrait') }}</option><option value="landscape">{{ text('Горизонтальная', 'Landscape') }}</option></select></label>
      <label>{{ text('Снимок в экране', 'Screen content') }}<select :value="value.fit" @change="patch('fit', ($event.target as HTMLSelectElement).value)"><option value="contain">{{ text('Вписать', 'Contain') }}</option><option value="cover">{{ text('Заполнить', 'Cover') }}</option></select></label>
      <CardNumber
        :label="text('Масштаб экрана %', 'Screen scale %')"
        :value="Math.round(value.zoom * 100)"
        :min="1"
        :max="1600"
        @change="patch('zoom', $event / 100)"
      />
      <CardNumber
        v-for="axis in ['x', 'y'] as const"
        :key="axis"
        :label="`${text('Экран', 'Screen')} ${axis.toUpperCase()}`"
        :value="value.offset[axis]"
        @change="patch('offset', { ...value.offset, [axis]: $event })"
      />
      <CardColor
        :label="text('Подложка экрана', 'Screen fill')"
        :value="value.screenColor"
        @change="patch('screenColor', $event)"
      />
    </template>
  </fieldset>
</template>
