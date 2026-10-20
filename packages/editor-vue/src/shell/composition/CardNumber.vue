<script setup lang="ts">
import { ref } from 'vue'
import { useNumericDraft } from '../ui/use-numeric-draft'
const props = withDefaults(defineProps<{
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}>(), { min: -100000, max: 100000, step: 1, disabled: false })
const emit = defineEmits<{ change: [value: number]; preview: [value: number]; cancel: [] }>()
const host = ref<HTMLElement>()
const { draft, invalid, blocked, shownMin, shownMax, shownStep, ariaValue, errorId,
  preview, keydown, blur, compositionstart, compositionend } = useNumericDraft(props, host, {
  preview: (value) => emit('preview', value),
  commit: (value) => emit('change', value),
  cancel: () => emit('cancel'),
})
</script>
<template>
  <label ref="host" class="cs-card-number"><span>{{ label }}</span><input
    class="cs-card-input"
    :value="draft"
    type="text"
    inputmode="decimal"
    role="spinbutton"
    :aria-label="label"
    :aria-valuemin="shownMin"
    :aria-valuemax="shownMax"
    :aria-valuenow="ariaValue"
    :aria-invalid="invalid"
    :aria-describedby="invalid ? errorId : undefined"
    :disabled="blocked"
    @input="preview(($event.target as HTMLInputElement).value)"
    @keydown="keydown"
    @blur="blur"
    @compositionstart="compositionstart"
    @compositionend="compositionend"
  /><small
    v-if="invalid"
    :id="errorId"
    class="cs-numeric-error"
    role="alert"
  >{{ shownMin }}–{{ shownMax }} · {{ shownStep }}</small></label>
</template>
