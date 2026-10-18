<script setup lang="ts">
import { computed } from 'vue'
import {
  calloutPathPoints,
  calloutRoutePreset,
  canRemoveCalloutStep,
  type CalloutPayload,
} from '@cute-screen/editor-renderer'

const props = defineProps<{ payload: CalloutPayload; locale: 'en' | 'ru'; disabled: boolean; mixed: boolean; multiple: boolean }>()
const emit = defineEmits<{ change: [id: string, value: string]; insert: [] }>()
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const category = computed(() => calloutRoutePreset(props.payload.route) === 'straight' ? 'straight' : 'corner')
const routes = computed(() => [
  { value: 'straight', label: text('Line', 'Линия') },
  { value: 'corner', label: text('Stepped', 'Ступенчатая') },
])
const sides = computed(() => [
  { value: 'auto', label: text('Auto', 'Авто'), x: 19, y: 10 },
  { value: 'right', label: text('Left', 'Слева'), x: 2, y: 10 },
  { value: 'left', label: text('Right', 'Справа'), x: 24, y: 10 },
  { value: 'bottom', label: text('Top', 'Сверху'), x: 13, y: 2 },
  { value: 'top', label: text('Bottom', 'Снизу'), x: 13, y: 18 },
])
function preview(value: string): string {
  const route = value === 'straight' ? { path: 'straight' as const } : { path: 'corner' as const, axis: 'y' as const }
  return calloutPathPoints({ ...props.payload, attachment: 'auto', target: { x: 4, y: 26 }, label: { x: 52, y: 6 }, route })
    .map((p) => `${p.x},${p.y}`).join(' ')
}
</script>

<template>
  <div class="cs-callout-choices">
    <button
      v-for="route in routes"
      :key="route.value"
      type="button"
      :aria-pressed="!mixed && category === route.value"
      :disabled="disabled"
      @click="emit('change', 'calloutRoute', route.value)"
    >
      <svg
        viewBox="0 0 56 32"
        aria-hidden="true"
        focusable="false"
      ><polyline
        :points="preview(route.value)"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      /></svg><span>{{ route.label }}</span>
    </button>
  </div>
  <button
    v-if="payload.route.path === 'quadratic'"
    type="button"
    :disabled="disabled"
    @click="emit('change', 'calloutRoute', 'straight')"
  >
    {{ text('Straighten', 'Выпрямить') }}
  </button>
  <button
    v-if="calloutRoutePreset(payload.route) === 'corner'"
    type="button"
    :disabled="disabled"
    @click="emit('change', 'calloutFlip', '')"
  >
    {{ text('Flip corner', 'Поменять угол') }}
  </button>
  <button
    v-if="category === 'corner' && !multiple"
    type="button"
    :disabled="disabled"
    @click="emit('insert')"
  >
    {{ text('Add step', 'Добавить ступень') }}
  </button>
  <template v-if="payload.route.path === 'orthogonal' && !multiple">
    <button
      type="button"
      :disabled="disabled || !canRemoveCalloutStep(payload, 1)"
      @click="emit('change', 'calloutRemoveStep', '')"
    >
      {{ text('Remove last step', 'Удалить последнюю ступень') }}
    </button>
    <button
      type="button"
      :disabled="disabled"
      @click="emit('change', 'calloutReset', '')"
    >
      {{ text('Reset route', 'Сбросить маршрут') }}
    </button>
  </template>
  <small v-if="category === 'corner'">{{ text('Alt + click an inner handle to remove that step', 'Alt + клик по внутренней ручке — удалить эту ступень') }}</small>
  <div
    class="cs-callout-field"
    role="group"
    :aria-label="text('Label position', 'Положение подписи')"
  >
    <span>{{ text('Label position', 'Положение подписи') }}</span>
    <div class="cs-callout-sides">
      <button
        v-for="side in sides"
        :key="side.value"
        type="button"
        :aria-label="side.label"
        :title="side.label"
        :aria-pressed="!mixed && payload.attachment === side.value"
        :disabled="disabled"
        @click="emit('change', 'calloutAttachment', side.value)"
      >
        <svg
          viewBox="0 0 40 28"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M4 14h16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          />
          <circle
            cx="20"
            cy="14"
            r="2"
            fill="currentColor"
          />
          <rect
            :x="side.x"
            :y="side.y"
            width="12"
            height="8"
            rx="1"
            fill="var(--surface-raised)"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <path
            v-if="side.value === 'auto'"
            d="m9 5-4 3 4 3m22 6 4 3-4 3"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
        <span>{{ side.label }}</span>
      </button>
    </div>
  </div>
</template>
