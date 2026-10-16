<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import type {
  CanvasMenuItem,
  CanvasMenuRequest,
} from '../workspace/selection-actions-controller'
const props = defineProps<{
  request?: CanvasMenuRequest | undefined
  items: readonly CanvasMenuItem[]
}>()
const emit = defineEmits<{ action: [id: string]; close: [] }>()
const root = ref<HTMLElement>()
const viewportWidth = () => window.innerWidth
const viewportHeight = () => window.innerHeight
let previousFocus: HTMLElement | undefined
function close(restoreFocus = true): void {
  emit('close')
  if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
}
function outside(event: PointerEvent): void {
  if (
    props.request &&
    event.target instanceof Node &&
    !root.value?.contains(event.target)
  ) close(false)
}
function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    close()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  const buttons = [...(root.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[index]?.focus()
}
watch(
  () => props.request,
  (request) => {
    if (!request) return
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    void nextTick(() => root.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus())
  },
)
onMounted(() => document.addEventListener('pointerdown', outside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside, true))
</script>
<template>
  <div
    v-if="request"
    ref="root"
    class="cs-canvas-context-menu"
    role="menu"
    :style="{
      left: `${Math.max(8, Math.min(request.clientX, viewportWidth() - 256))}px`,
      top: `${Math.max(8, Math.min(request.clientY, viewportHeight() - items.length * 36 - 16))}px`,
    }"
    @keydown="keydown"
    @contextmenu.prevent
    @pointerdown.stop
  >
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      role="menuitem"
      :disabled="item.disabled"
      :title="item.disabled ? item.reason : undefined"
      @click="emit('action', item.id)"
    >
      {{ item.label }}
    </button>
  </div>
</template>
