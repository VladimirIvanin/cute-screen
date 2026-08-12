<script setup lang="ts">
import { ref, watch } from 'vue'
import { NInputNumber } from 'naive-ui'

const props = defineProps<{
  modelValue: number
  min: number
  max: number
  step: number
  ariaLabel: string
  disabled?: boolean
}>()
const emit = defineEmits<{ commit: [value: number] }>()
const value = ref<number | null>(props.modelValue)

watch(
  () => props.modelValue,
  (next) => {
    value.value = next
  },
)

function commit(): void {
  if (value.value !== null) emit('commit', value.value)
}
</script>

<template>
  <NInputNumber
    v-model:value="value"
    class="cs-ui-number-input"
    :min="min"
    :max="max"
    :step="step"
    :show-button="false"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @blur="commit"
    @keyup.enter="commit"
  />
</template>
