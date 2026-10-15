<script setup lang="ts">
import {
  ref,
  watch,
} from 'vue'

const props = defineProps<{
  label: string
  compactLabel?: string
  value: number
  min: number
  max: number
  step: number
  mixed?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ commit: [value: number] }>()
const draft = ref(props.mixed ? '' : String(props.value))
const invalid = ref(false)
watch(() => [props.value, props.mixed] as const, ([value, mixed]) => {
  draft.value = mixed ? '' : String(value)
  invalid.value = false
})
function commit(): void {
  const value = Number(draft.value)
  const steps = (value - props.min) / props.step
  invalid.value =
    String(draft.value).trim() === '' ||
    !Number.isFinite(value) ||
    value < props.min ||
    value > props.max ||
    Math.abs(steps - Math.round(steps)) > 0.000001
  if (
    !props.disabled &&
    !invalid.value &&
    (value !== props.value ||
      props.mixed)
  ) emit('commit', value)
}
function cancel(): void {
  draft.value = String(props.value)
  invalid.value = false
}
</script>

<template>
  <label class="cs-shape-number">
    <span>{{ compactLabel ?? label }}{{ mixed ? ' · —' : '' }}</span>
    <input
      v-model="draft"
      type="number"
      :aria-label="label"
      :aria-invalid="invalid"
      :placeholder="mixed ? '—' : undefined"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      @change="commit"
      @keydown.enter.prevent="commit"
      @keydown.esc="cancel"
    >
    <small v-if="invalid" role="alert">{{ min }}–{{ max }} ({{ step }})</small>
  </label>
</template>
