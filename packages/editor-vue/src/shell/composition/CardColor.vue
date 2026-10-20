<script setup lang="ts">
import { computed } from 'vue'
import type { CardColor } from '@cute-screen/editor-renderer'
import CardNumber from './CardNumber.vue'
const props = defineProps<{ value: CardColor; label: string; disabled?: boolean }>()
const emit = defineEmits<{ change: [value: CardColor] }>()
const hex = computed(() => '#' + [props.value.red, props.value.green, props.value.blue].map((n) => Math.round(n * 255).toString(16).padStart(2, '0')).join(''))
function change(value: string): void {
  const channels = [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16) / 255)
  emit('change', { red: channels[0]!, green: channels[1]!, blue: channels[2]!, alpha: props.value.alpha })
}
</script>
<template>
  <label class="cs-card-color"><span>{{ label }}</span><input
    type="color"
    :value="hex"
    :disabled="disabled"
    @change="change(($event.target as HTMLInputElement).value)"
  /><input
    class="cs-card-input"
    :aria-label="`${label} HEX`"
    :value="hex"
    :disabled="disabled"
    pattern="#[a-fA-F0-9]{6}"
    @change="/^#[a-fA-F0-9]{6}$/.test(($event.target as HTMLInputElement).value) && change(($event.target as HTMLInputElement).value)"
  /></label>
  <CardNumber
    :label="`${label} α %`"
    :value="Math.round(value.alpha * 100)"
    :min="0"
    :max="100"
    :disabled="disabled"
    @change="emit('change', { ...value, alpha: $event / 100 })"
  />
</template>
