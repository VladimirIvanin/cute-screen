<script setup lang="ts">
import type { CalloutWidthSnapshot } from '../canvas/contracts'
import NumericControl from './NumericControl.vue'
import { textFormattingLabel } from './text-formatting-labels'

const props = defineProps<{
  width: CalloutWidthSnapshot
  locale?: 'en' | 'ru' | undefined
  disabled?: boolean | undefined
}>()
const emit = defineEmits<{ change: [value: string]; opened: [] }>()
const label = (key: 'width' | 'auto') => textFormattingLabel(props.locale, key)
</script>

<template>
  <div
    class="cs-text-control-group cs-callout-width-control"
    data-text-control="width"
    @focusin="emit('opened')"
    @pointerdown="emit('opened')"
  >
    <NumericControl
      :label="label('width')"
      :value="Math.max(width.minimum, Math.round(width.value * 100) / 100)"
      :min="width.minimum"
      :step="0.01"
      unit="px"
      :locale="locale"
      :disabled="disabled"
      @commit="emit('change', String($event))"
    />
    <button
      type="button"
      :disabled="disabled"
      :aria-pressed="width.mode === 'autoSize'"
      :title="label('auto')"
      @click="emit('change', 'auto')"
    >
      {{ label('auto') }}
    </button>
  </div>
</template>
