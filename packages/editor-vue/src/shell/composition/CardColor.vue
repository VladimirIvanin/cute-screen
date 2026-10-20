<script setup lang="ts">
import { computed } from 'vue'
import type { CardColor } from '@cute-screen/editor-renderer'
import CardNumber from './CardNumber.vue'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
const props = withDefaults(defineProps<{
  value: CardColor
  label: string
  disabled?: boolean
  compact?: boolean
  opacityLabel?: string
  locale?: 'ru' | 'en'
  showOpacity?: boolean
}>(), { locale: 'en', showOpacity: true })
const emit = defineEmits<{ change: [value: CardColor]; preview: [value: CardColor]; cancel: [] }>()
const hex = computed(() => '#' + [props.value.red, props.value.green, props.value.blue].map((n) => Math.round(n * 255).toString(16).padStart(2, '0')).join(''))
function change(value: string): void {
  if (props.disabled || !/^#[a-fA-F0-9]{6}$/.test(value)) return
  const channels = [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16) / 255)
  emit('change', { red: channels[0]!, green: channels[1]!, blue: channels[2]!, alpha: props.value.alpha })
}
</script>
<template>
  <div :class="{ 'cs-card-color-compact': compact }">
    <div
      class="cs-card-color"
      role="group"
      :aria-label="label"
    >
      <span>{{ label }}</span><SimpleColorPicker
        :model-value="hex"
        v-bind="{ ariaLabel: label }"
        :disabled="disabled"
        :locale="locale"
        :eyedropper="false"
        compact
        @commit="change"
      /><input
        class="cs-card-input"
        :aria-label="`${label} HEX`"
        :value="hex"
        :disabled="disabled"
        pattern="#[a-fA-F0-9]{6}"
        @change="/^#[a-fA-F0-9]{6}$/.test(($event.target as HTMLInputElement).value) && change(($event.target as HTMLInputElement).value)"
      />
    </div>
    <CardNumber
      v-if="showOpacity"
      :label="opacityLabel ?? `${label} α %`"
      :value="Math.round(value.alpha * 100)"
      :min="0"
      :max="100"
      :disabled="disabled"
      @change="emit('change', { ...value, alpha: $event / 100 })"
      @preview="emit('preview', { ...value, alpha: $event / 100 })"
      @cancel="emit('cancel')"
    />
  </div>
</template>
