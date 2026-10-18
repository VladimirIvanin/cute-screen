<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
  type CSSProperties,
} from 'vue'
import type { CalloutWidthSnapshot } from '../canvas/contracts'
import { UiIcon } from '../icon'
import NumericControl from './NumericControl.vue'
import { textFormattingLabel } from './text-formatting-labels'
import { usePreviewPopover } from './use-preview-popover'

const props = defineProps<{
  width: CalloutWidthSnapshot
  locale?: 'en' | 'ru' | undefined
  disabled?: boolean | undefined
}>()
const emit = defineEmits<{ change: [value: string]; opened: [] }>()
const label = () => textFormattingLabel(props.locale, 'width')
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const open = ref(false)
const hintId = useId()
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const summary = computed(() => props.width.mode === 'autoSize'
  ? text('Fit text', 'По тексту')
  : `${Math.round(props.width.value * 100) / 100} px`)
const position = usePreviewPopover(
  () => open.value ? trigger.value : undefined,
  () => panel.value,
)
const style = computed<CSSProperties>(() => ({
  position: 'fixed',
  left: `${position.value?.left ?? 0}px`,
  top: `${position.value?.top ?? 0}px`,
  visibility: position.value ? 'visible' : 'hidden',
}))

function close(restoreFocus = true): void {
  if (!open.value) return
  open.value = false
  if (restoreFocus) void nextTick(() => trigger.value?.focus({ preventScroll: true }))
}
function escape(event: KeyboardEvent): void {
  if (!open.value) return
  event.preventDefault()
  event.stopPropagation()
  close()
}
function toggle(): void {
  if (props.disabled) return
  if (open.value) return close()
  emit('opened')
  open.value = true
  void nextTick(() => requestAnimationFrame(() => {
    if (open.value) panel.value?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }))
}
function outside(event: PointerEvent): void {
  if (!(event.target instanceof Node)) return
  if (!trigger.value?.contains(event.target) && !panel.value?.contains(event.target)) close(false)
}
function change(value: string): void {
  if (!props.disabled) emit('change', value)
}
watch(() => props.disabled, (disabled) => {
  if (disabled) close(false)
})
onMounted(() => document.addEventListener('pointerdown', outside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside, true))
defineExpose({ close })
</script>

<template>
  <div
    class="cs-text-control-group cs-callout-width-control"
    data-text-control="width"
  >
    <button
      ref="trigger"
      type="button"
      :disabled="disabled"
      :aria-label="`${label()}: ${summary}`"
      :title="`${label()}: ${summary}`"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="toggle"
      @keydown.escape="escape"
    >
      <span>{{ text('Width', 'Ширина') }}</span>
      <span class="cs-callout-width-summary">{{ summary }}</span>
      <UiIcon name="chevronDown" class="cs-tool-settings-chevron" />
    </button>
    <Teleport to=".cs-overlay-root" defer>
      <section
        v-if="open"
        ref="panel"
        class="cs-callout-width-popover"
        :style="style"
        role="dialog"
        :aria-label="label()"
        @keydown.escape.prevent.stop="close()"
      >
        <button
          type="button"
          :disabled="disabled"
          :aria-describedby="hintId"
          :aria-pressed="width.mode === 'autoSize'"
          @click="change('auto')"
        >
          {{ text('Fit to content', 'По содержимому') }}
        </button>
        <p :id="hintId">{{ text('Grows to 480 px, then wraps.', 'Растёт до 480 px, затем перенос строк.') }}</p>
        <NumericControl
          :label="label()"
          :value="Math.max(width.minimum, Math.round(width.value * 100) / 100)"
          :min="width.minimum"
          :step="0.01"
          unit="px"
          :locale="locale"
          :disabled="disabled"
          @commit="change(String($event))"
        />
      </section>
    </Teleport>
  </div>
</template>
