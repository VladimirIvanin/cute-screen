<script setup lang="ts">
import { ref, watch } from 'vue'
import { NColorPicker } from 'naive-ui'

const props = defineProps<{ modelValue: string; ariaLabel: string }>()
const emit = defineEmits<{ commit: [value: string] }>()
const value = ref(props.modelValue)
const shown = ref(false)
const host = ref<HTMLElement>()
const confirmed = ref(false)

function openFromKeyboard(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  host.value?.querySelector<HTMLElement>('.n-color-picker')?.click()
}

watch(
  () => props.modelValue,
  (next) => {
    if (!shown.value) value.value = next
  },
)

function close(next: boolean): void {
  const wasShown = shown.value
  shown.value = next
  if (wasShown && !next && !confirmed.value) emit('commit', value.value)
  if (!next) confirmed.value = false
}

function confirm(): void {
  confirmed.value = true
  emit('commit', value.value)
}
</script>

<template>
  <div
    ref="host"
    class="cs-ui-color-picker"
    role="button"
    tabindex="0"
    :aria-label="ariaLabel"
    @keydown="openFromKeyboard"
  >
    <NColorPicker
      v-model:value="value"
      v-model:show="shown"
      :show-alpha="false"
      :actions="['confirm']"
      to=".cs-overlay-root"
      @update:show="close"
      @confirm="confirm"
    />
  </div>
</template>
