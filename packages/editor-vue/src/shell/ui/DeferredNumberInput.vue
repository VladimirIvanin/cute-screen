<script setup lang="ts">
import NumericControl from './NumericControl.vue'
defineProps<{
  modelValue: number
  min: number
  max: number
  step: number
  ariaLabel: string
  disabled?: boolean
}>()
const emit = defineEmits<{ commit: [value: number] }>()
</script>
<template>
  <NumericControl
    class="cs-ui-number-input"
    :value="modelValue"
    :min="min"
    :max="max"
    :step="step"
    :label="ariaLabel"
    :disabled="disabled"
    @commit="emit('commit', $event)"
  />
</template>
