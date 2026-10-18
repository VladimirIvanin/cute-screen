<script setup lang="ts">
import { computed } from 'vue'
import type {
  CalloutPayload,
  CalloutMarkerStyle,
} from '@cute-screen/editor-renderer'
import NumericControl from '../ui/NumericControl.vue'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import { parseHexColor } from '../tools/effects/color'

const props = defineProps<{ payload: CalloutPayload; locale: 'en' | 'ru'; disabled: boolean; mixed: boolean }>()
const emit = defineEmits<{ change: [id: string, value: string] }>()
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const markers = computed(() => [
  { value: 'none', label: text('None', 'Нет') },
  { value: 'circle', label: text('Dot', 'Точка') },
  { value: 'ring', label: text('Ring', 'Кольцо') },
  { value: 'lineArrow', label: text('Open arrow', 'Открытая стрелка') },
  { value: 'solidArrow', label: text('Filled arrow', 'Заполненная стрелка') },
])
const hex = (color: { red: number; green: number; blue: number }) =>
  '#' + [color.red, color.green, color.blue].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
function style(
  endpoint: 'target' | 'label',
  patch: CalloutMarkerStyle,
): void {
  emit('change', endpoint === 'target' ? 'calloutTargetMarkerStyle' : 'calloutLabelMarkerStyle', JSON.stringify(patch))
}
function color(
  endpoint: 'target' | 'label',
  value: string,
): void {
  const parsed = parseHexColor(value)
  if (parsed) style(endpoint, { color: parsed })
}
</script>

<template>
  <section
    v-for="endpoint in ['target', 'label'] as const"
    :key="endpoint"
    class="cs-callout-endpoint"
    :aria-label="endpoint === 'target' ? text('At target', 'У цели') : text('At label', 'У подписи')"
  >
    <span>{{ endpoint === 'target' ? text('At target', 'У цели') : text('At label', 'У подписи') }}</span>
    <div class="cs-callout-marker-choices">
      <button
        v-for="marker in markers"
        :key="marker.value"
        type="button"
        :aria-label="marker.label"
        :title="marker.label"
        :aria-pressed="!mixed && payload[`${endpoint}Marker`] === marker.value"
        :disabled="disabled"
        @click="emit('change', endpoint === 'target' ? 'calloutTargetMarker' : 'calloutLabelMarker', marker.value)"
      >
        <svg
          viewBox="0 0 40 24"
          aria-hidden="true"
          focusable="false"
        >
          <g
            :transform="endpoint === 'target' ? 'translate(40 0) scale(-1 1)' : undefined"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="marker.value === 'none' ? 'M4 12h30' : 'M4 12h24'"/>
            <circle
              v-if="marker.value === 'circle' || marker.value === 'ring'"
              cx="29"
              cy="12"
              r="4"
              :fill="marker.value === 'circle' ? 'currentColor' : 'var(--surface-raised)'"
            />
            <path v-if="marker.value === 'lineArrow'" d="m25 6 9 6-9 6"/>
            <path
              v-if="marker.value === 'solidArrow'"
              d="m24 6 10 6-10 6z"
              fill="currentColor"
            />
          </g>
        </svg>
      </button>
    </div>
    <div v-if="payload[`${endpoint}Marker`] !== 'none'" class="cs-callout-endpoint-properties">
      <NumericControl
        :label="text('Size', 'Размер')"
        :value="payload[`${endpoint}MarkerStyle`]?.size ?? Math.max(10, payload.stroke.width * 3)"
        :min="2"
        :max="128"
        :step="1"
        unit="px"
        :locale="locale"
        :disabled="disabled"
        :mixed="mixed"
        @commit="style(endpoint, { size: $event })"
      />
      <SimpleColorPicker
        :model-value="hex(payload[`${endpoint}MarkerStyle`]?.color ?? payload.stroke.color)"
        v-bind="{ ariaLabel: text('Marker color', 'Цвет наконечника') }"
        :locale="locale"
        :eyedropper="false"
        :disabled="disabled"
        :mixed="mixed"
        @commit="color(endpoint, $event)"
      />
      <button
        type="button"
        :disabled="disabled"
        :title="text('Use line color and automatic size', 'Цвет линии и автоматический размер')"
        @click="style(endpoint, {})"
      >
        {{ text('Auto', 'Авто') }}
      </button>
    </div>
  </section>
</template>
