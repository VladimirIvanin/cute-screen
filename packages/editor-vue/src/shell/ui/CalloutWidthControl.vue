<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import type { CalloutWidthSnapshot } from '../canvas/contracts'
import { usePreviewPopover } from './use-preview-popover'
import { textFormattingLabel } from './text-formatting-labels'

const props = defineProps<{
  width: CalloutWidthSnapshot
  locale?: 'en' | 'ru' | undefined
  disabled?: boolean | undefined
}>()
const emit = defineEmits<{ change: [value: string]; opened: [] }>()
const open = ref(false)
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const input = ref<HTMLInputElement>()
const draft = ref('')
let needsFocus = false
const label = (key: Parameters<typeof textFormattingLabel>[1]) => textFormattingLabel(props.locale, key)
const position = usePreviewPopover(() => open.value ? trigger.value : undefined, () => panel.value)
const valid = computed(() => (
  String(draft.value).trim() !== '' &&
  Number.isFinite(Number(draft.value)) &&
  Number(draft.value) >= props.width.minimum
))

function close(restore = true): void {
  open.value = false
  needsFocus = false
  if (restore) void nextTick(() => trigger.value?.focus({ preventScroll: true }))
}
function show(): void {
  if (props.disabled) return
  if (open.value) {
    close()
    return
  }
  emit('opened')
  draft.value = String(Math.max(props.width.minimum, Math.round(props.width.value * 100) / 100))
  needsFocus = true
  open.value = true
}
function apply(value: string): void {
  if (
    props.disabled ||
    (value !== 'auto' &&
      !valid.value)
  ) return
  emit('change', String(value))
  close()
}
function outside(event: PointerEvent): void {
  if (
    open.value &&
    event.target instanceof Node &&
    !panel.value?.contains(event.target) &&
    !trigger.value?.contains(event.target)
  ) close(false)
}
watch([open, position], ([visible, placement]) => {
  if (
    !visible ||
    !placement ||
    !needsFocus
  ) return
  void nextTick(() => {
    if (!open.value || !needsFocus) return
    input.value?.focus({ preventScroll: true })
    input.value?.select()
    needsFocus = false
  })
}, { flush: 'post' })
watch(() => props.disabled, (value) => {
  if (value) close(false)
})
onMounted(() => document.addEventListener('pointerdown', outside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside, true))
defineExpose({ close: () => close(false) })
</script>

<template>
  <div class="cs-text-control-group" data-text-control="width">
    <button
      ref="trigger"
      :disabled="disabled"
      :aria-label="label('width')"
      :title="label('width')"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="show"
    >
      {{ width.mode === 'autoSize' ? label('auto') : `${Math.round(width.value)} px` }}
    </button>
    <Teleport to=".cs-overlay-root" defer>
      <section
        v-if="open"
        ref="panel"
        class="cs-callout-width-popover cs-text-numeric-popover"
        role="dialog"
        :aria-label="label('width')"
        :style="{
          position: 'fixed',
          left: `${position?.left ?? 0}px`,
          top: `${position?.top ?? 0}px`,
          visibility: position ? 'visible' : 'hidden',
        }"
        @pointerdown.stop
        @keydown.escape.stop.prevent="close()"
        @keydown.enter.stop.prevent="apply(draft)"
      >
        <label>{{ label('width') }}
          <input
            ref="input"
            v-model="draft"
            type="number"
            :min="width.minimum"
            step="any"
            :aria-invalid="!valid"
            :aria-label="label('width')"
          />
        </label>
        <button type="button" @click="apply('auto')">{{ label('auto') }}</button>
        <button
          type="button"
          :disabled="!valid"
          @click="apply(draft)"
        >
          {{ label('apply') }}
        </button>
        <button type="button" @click="close()">{{ label('cancel') }}</button>
      </section>
    </Teleport>
  </div>
</template>
