<script setup lang="ts">
import {
  ref,
  watch,
} from 'vue'
const props = withDefaults(defineProps<{
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}>(),
{ min: -100000,
  max: 100000,
  step: 1,
  disabled: false })
const emit = defineEmits<{ change: [value: number]; preview: [value: number]; cancel: [] }>()
const draft = ref(props.value)
watch(() => props.value, (value) => {
  draft.value = value
})
function valid(): boolean {
  return Number.isFinite(draft.value) && draft.value >= props.min && draft.value <= props.max
}
function cancel(): void {
  draft.value = props.value
  emit('cancel')
}
</script>
<template>
  <label class="cs-card-number"><span>{{ label }}</span><input
    class="cs-card-input"
    v-model.number="draft"
    type="number"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    @input="valid() && emit('preview', draft)"
    @change="valid() ? emit('change', draft) : cancel()"
    @keydown.esc.prevent.stop="cancel"
    @pointercancel="cancel"
  /></label>
</template>
