<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { NSelect, type SelectOption } from 'naive-ui'

const props = defineProps<{
  modelValue: string | number
  options: readonly SelectOption[]
  ariaLabel: string
  size?: 'small' | 'medium' | 'large'
  class?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()
const host = ref<HTMLElement>()

function labelInteractivePart(): void {
  const target = host.value?.querySelector<HTMLElement>('.n-base-selection')
  if (!target) return
  target.setAttribute('role', 'combobox')
  target.setAttribute('aria-label', props.ariaLabel)
}

function labelOptions(): void {
  document
    .querySelectorAll<HTMLElement>('.cs-overlay-root .n-base-select-option')
    .forEach((option) => {
      option.setAttribute('role', 'option')
      option.setAttribute(
        'aria-selected',
        option.classList.contains('n-base-select-option--selected')
          ? 'true'
          : 'false',
      )
    })
}

function scheduleOptionLabels(): void {
  void nextTick().then(() => nextTick(labelOptions))
}

onMounted(() => void nextTick(labelInteractivePart))
watch(
  () => props.ariaLabel,
  () => void nextTick(labelInteractivePart),
)
</script>

<template>
  <div ref="host" :class="props.class" @click="scheduleOptionLabels">
    <NSelect
      :value="modelValue"
      :size="size ?? 'small'"
      :options="[...options]"
      :virtual-scroll="false"
      to=".cs-overlay-root"
      @update:value="
        typeof $event === 'string' || typeof $event === 'number'
          ? emit('update:modelValue', $event)
          : undefined
      "
    />
  </div>
</template>
