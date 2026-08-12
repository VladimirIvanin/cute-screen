<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { NSlider } from 'naive-ui'

const props = defineProps<{
  modelValue: number
  min: number
  max: number
  step: number
  ariaLabel: string
  disabled?: boolean
}>()
const emit = defineEmits<{ commit: [value: number] }>()
const value = ref(props.modelValue)
const dragging = ref(false)
const host = ref<HTMLElement>()

function labelHandle(): void {
  host.value
    ?.querySelector<HTMLElement>('[role="slider"]')
    ?.setAttribute('aria-label', props.ariaLabel)
}

function scheduleLabel(): void {
  void nextTick().then(() => nextTick(labelHandle))
}

onMounted(scheduleLabel)
watch(() => props.ariaLabel, scheduleLabel)

watch(
  () => props.modelValue,
  (next) => {
    if (!dragging.value) value.value = next
  },
)

function update(next: number): void {
  value.value = next
  // Keyboard interaction is already discrete. Pointer drags commit only once
  // from dragend, preventing a command/history entry per input event.
  if (!dragging.value) emit('commit', next)
}

function complete(): void {
  if (!dragging.value) return
  dragging.value = false
  emit('commit', value.value)
}
</script>

<template>
  <div ref="host" class="cs-ui-slider">
    <NSlider
      v-model:value="value"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @update:value="update"
      @dragstart="dragging = true"
      @dragend="complete"
    />
  </div>
</template>
