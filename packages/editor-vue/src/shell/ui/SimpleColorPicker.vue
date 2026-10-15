<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
} from 'vue'
import { NPopover } from 'naive-ui'
import { usePreviewPopover } from './use-preview-popover'
import type { SrgbColor } from '@cute-screen/editor-renderer'
import DeferredColorPicker from './DeferredColorPicker.vue'
import { UiIcon } from '../icon'

const props = withDefaults(defineProps<{
  modelValue: string
  ariaLabel: string
  recentColors?: readonly SrgbColor[]
  disabled?: boolean
  mixed?: boolean
  eyedropper?: boolean
  locale?: 'en' | 'ru'
  embedded?: boolean
  palette?: 'drawing' | 'highlighter'
}>(), { recentColors: () => [], disabled: false, mixed: false, eyedropper: true, locale: 'en', embedded: false, palette: 'drawing' })
const emit = defineEmits<{ commit: [value: string]; eyedropper: []; dismiss: []; opened: [] }>()
const shown = ref(false)
const custom = ref(false)
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const customTrigger = ref<HTMLButtonElement>()
const popoverPosition = usePreviewPopover(
  () => !props.embedded && shown.value ? trigger.value : undefined,
  () => !props.embedded && shown.value ? panel.value : undefined,
)
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const highlighter = ['#FFD54A', '#FFA629', '#FF6BA8', '#B58AFF', '#57ACFF', '#49CCBE', '#78D66D', '#D9D9D9']
const drawing = [
  '#1E1E1E', '#757575', '#FF7556', '#FF9E42', '#FFC943', '#66D575', '#5AD8CC', '#3DADFF', '#9747FF', '#F849C1',
  '#FFFFFF', '#D9D9D9', '#FFCDC2', '#FFE0C2', '#FFECBD', '#CDF4D3', '#C6FAF6', '#C2E5FF', '#E4CCFF', '#FFC2EC',
]
const colors = computed(() => props.palette === 'highlighter' ? highlighter : drawing)
const names = computed(() => props.palette === 'highlighter'
  ? [text('Yellow', 'Жёлтый'), text('Orange', 'Оранжевый'), text('Pink', 'Розовый'), text('Violet', 'Фиолетовый'), text('Blue', 'Голубой'), text('Teal', 'Бирюзовый'), text('Green', 'Зелёный'), text('Grey', 'Серый')]
  : [text('Black', 'Чёрный'), text('Grey', 'Серый'), text('Red', 'Красный'), text('Orange', 'Оранжевый'), text('Yellow', 'Жёлтый'), text('Green', 'Зелёный'), text('Teal', 'Бирюзовый'), text('Blue', 'Голубой'), text('Violet', 'Фиолетовый'), text('Pink', 'Розовый'), text('White', 'Белый'), text('Light grey', 'Светло-серый'), text('Light red', 'Светло-красный'), text('Light orange', 'Светло-оранжевый'), text('Light yellow', 'Светло-жёлтый'), text('Light green', 'Светло-зелёный'), text('Light teal', 'Светло-бирюзовый'), text('Light blue', 'Светло-голубой'), text('Light violet', 'Светло-фиолетовый'), text('Light pink', 'Светло-розовый')])
function show(next: boolean): void {
  shown.value = next
  custom.value = false
  if (next) emit('opened')
  void nextTick(() => {
    if (next) panel.value?.querySelector<HTMLElement>('[aria-pressed="true"], button:not(:disabled)')?.focus({ preventScroll: true })
    else trigger.value?.focus({ preventScroll: true })
  })
}
function choose(color: string): void {
  if (props.disabled) return
  emit('commit', color)
  if (!props.embedded) show(false)
}
function back(): void {
  custom.value = false
  void nextTick(() => customTrigger.value?.focus({ preventScroll: true }))
}
function dismiss(): void {
  if (custom.value) back()
  else if (props.embedded) emit('dismiss')
  else show(false)
}
function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    dismiss()
    return
  }
  if (custom.value) return
  const buttons = Array.from(panel.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
  const index = buttons.indexOf(event.target as HTMLButtonElement)
  if (index < 0) return
  const columns = props.palette === 'highlighter' ? 9 : 10
  const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }
  if (
    !(event.key in moves) &&
    event.key !== 'Home' &&
    event.key !== 'End'
  ) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + moves[event.key]!))
  buttons[next]?.focus()
}
watch(() => props.disabled, (disabled) => {
  if (disabled) show(false)
})
watch(custom, (next) => {
  if (next) void nextTick(() => panel.value?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }))
})
defineExpose({ close: () => show(false) })
function sample(): void {
  show(false)
  emit('eyedropper')
}
function outside(event: MouseEvent): void {
  if (event.target instanceof Node && trigger.value?.contains(event.target)) return
  show(false)
}
</script>

<template>
  <div class="cs-simple-color-picker">
    <button
      v-if="!embedded"
      ref="trigger"
      class="cs-simple-color-trigger"
      type="button"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :aria-expanded="shown"
      aria-haspopup="dialog"
      :title="ariaLabel"
      @click="show(!shown)"
    >
      <span
        class="cs-simple-color-current"
        :class="{ 'is-mixed': mixed }"
        :style="{ backgroundColor: mixed ? undefined : modelValue }"
      >{{ mixed ? '—' : '' }}</span>
      <UiIcon name="chevronDown"/>
    </button>
    <component
      :is="embedded ? 'div' : NPopover"
      v-bind="embedded ? {} : { show: shown, disabled, trigger: 'manual', placement: 'top-start', x: popoverPosition?.left ?? 0, y: popoverPosition?.top ?? 0, overlap: true, flip: false, showArrow: false, raw: true, to: '.cs-overlay-root' }"
      @update:show="show"
      @clickoutside="outside"
    >
      <div
        ref="panel"
        class="cs-simple-color-panel cs-color-picker-popover"
        :class="{ 'is-embedded': embedded }"
        role="dialog"
        :aria-label="ariaLabel"
        @keydown="keydown"
        @pointerdown.stop
      >
        <template v-if="custom">
          <button
            class="cs-color-back"
            type="button"
            @click="back"
          >
            ← {{ text('Palette', 'Палитра') }}
          </button>
          <DeferredColorPicker
            :model-value="modelValue"
            v-bind="{ ariaLabel }"
            :recent-colors="recentColors"
            :disabled="disabled"
            :eyedropper="eyedropper"
            :locale="locale"
            embedded
            @commit="choose"
            @dismiss="back"
            @eyedropper="sample"
          />
        </template>
        <div
          v-else
          class="cs-simple-color-grid"
          :class="{ 'is-highlighter': palette === 'highlighter' }"
          role="group"
          :aria-label="ariaLabel"
        >
          <button
            v-for="(color, index) in colors"
            :key="color"
            class="cs-simple-color-swatch"
            type="button"
            :style="{ backgroundColor: color }"
            :disabled="disabled"
            :aria-label="names[index]"
            :title="names[index]"
            :aria-pressed="!mixed && modelValue.toUpperCase() === color"
            @click="choose(color)"
          />
          <button
            ref="customTrigger"
            class="cs-simple-color-swatch cs-simple-color-custom"
            type="button"
            :disabled="disabled"
            :aria-label="text('Custom colour', 'Свой цвет')"
            :title="text('Custom colour', 'Свой цвет')"
            :aria-pressed="!mixed && !colors.includes(modelValue.toUpperCase())"
            @click="custom = true"
          />
        </div>
      </div>
    </component>
  </div>
</template>
