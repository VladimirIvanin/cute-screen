<script setup lang="ts">
import { useId } from 'vue'
import type { CardFrame } from '@cute-screen/editor-renderer'
import CardNumber from './CardNumber.vue'
import CardColor from './CardColor.vue'
const props = defineProps<{ value: CardFrame; locale: 'ru' | 'en'; disabled: boolean }>()
const emit = defineEmits<{ change: [value: CardFrame]; preview: [value: CardFrame]; cancel: [] }>()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
const groupName = useId()
function patch(
  key: string,
  value: unknown,
  preview = false,
): void {
  if (preview) emit('preview', { ...props.value, [key]: value })
  else emit('change', { ...props.value, [key]: value })
}
</script>
<template>
  <fieldset :disabled="disabled">
    <div
      class="cs-card-frame-types"
      role="radiogroup"
      :aria-label="text('Тип рамки', 'Frame type')"
    >
      <label
        v-for="(label, kind) in { none: text('Без рамки', 'No frame'), window: text('Окно', 'Window'), browser: text('Браузер', 'Browser'), phone: text('Телефон', 'Phone') }"
        :key="kind"
        class="cs-card-frame-option"
      >
        <input
          type="radio"
          :name="groupName"
          :value="kind"
          :checked="value.kind === kind"
          @change="patch('kind', kind)"
        />
        <span class="cs-card-frame-choice" :class="{ 'is-selected': value.kind === kind }">
          <svg
            viewBox="0 0 64 44"
            aria-hidden="true"
            focusable="false"
          >
            <template v-if="kind === 'phone'">
              <rect
                class="cs-card-frame-body"
                x="22"
                y="2"
                width="20"
                height="40"
                rx="5"
              />
              <rect
                class="cs-card-frame-screen"
                x="25"
                y="7"
                width="14"
                height="30"
                rx="2"
              />
              <path d="M29 5h6M30 39h4" />
            </template>
            <template v-else>
              <rect
                class="cs-card-frame-body"
                x="5"
                y="6"
                width="54"
                height="34"
                rx="4"
                :stroke-dasharray="kind === 'none' ? '3 3' : undefined"
              />
              <rect
                class="cs-card-frame-screen"
                x="8"
                :y="kind === 'none' ? 9 : kind === 'browser' ? 22 : 17"
                width="48"
                :height="kind === 'none' ? 28 : kind === 'browser' ? 15 : 20"
                rx="1"
              />
              <template v-if="kind !== 'none'">
                <circle
                  cx="11"
                  cy="11"
                  r="1"
                /><circle
                  cx="16"
                  cy="11"
                  r="1"
                /><circle
                  cx="21"
                  cy="11"
                  r="1"
                />
                <path d="M6 15h52" />
                <rect
                  v-if="kind === 'browser'"
                  class="cs-card-frame-address"
                  x="15"
                  y="17"
                  width="38"
                  height="3"
                  rx="1"
                />
              </template>
            </template>
          </svg>
          <span>{{ label }}</span>
        </span>
      </label>
    </div>
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
        @preview="patch('zoom', $event / 100, true)"
        @cancel="emit('cancel')"
      />
      <CardNumber
        v-for="axis in ['x', 'y'] as const"
        :key="axis"
        :label="`${text('Экран', 'Screen')} ${axis.toUpperCase()}`"
        :value="value.offset[axis]"
        @change="patch('offset', { ...value.offset, [axis]: $event })"
        @preview="patch('offset', { ...value.offset, [axis]: $event }, true)"
        @cancel="emit('cancel')"
      />
      <CardColor
        :label="text('Подложка экрана', 'Screen fill')"
        :value="value.screenColor"
        :locale="locale"
        :disabled="disabled"
        @change="patch('screenColor', $event)"
        @preview="patch('screenColor', $event, true)"
        @cancel="emit('cancel')"
      />
    </template>
  </fieldset>
</template>
