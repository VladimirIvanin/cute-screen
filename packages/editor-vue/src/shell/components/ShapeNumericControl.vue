<script setup lang="ts">
import NumericControl from '../ui/NumericControl.vue'

defineProps<{
  label: string
  compactLabel?: string | undefined
  value: number
  min: number
  max: number
  step: number
  mixed?: boolean | undefined
  disabled?: boolean | undefined
  controlId?: string | undefined
  unit?: string | undefined
  slider?: boolean | undefined
  stepper?: boolean | undefined
  displayScale?: number | undefined
  presets?: readonly number[] | undefined
  locale?: 'en' | 'ru' | undefined
}>()
const emit = defineEmits<{ commit: [value: number] }>()
</script>

<template>
  <NumericControl
    :label="label"
    :compact-label="compactLabel"
    :value="value"
    :min="min"
    :max="max"
    :step="step"
    :mixed="mixed"
    :disabled="disabled"
    :control-id="controlId"
    :unit="unit"
    :slider="slider"
    :stepper="stepper"
    :display-scale="displayScale"
    :presets="presets"
    :locale="locale"
    @commit="emit('commit', $event)"
  />
</template>
