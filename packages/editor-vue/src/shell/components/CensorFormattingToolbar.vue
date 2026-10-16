<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
} from 'vue'
import { NPopover } from 'naive-ui'
import type { SrgbColor } from '@cute-screen/editor-renderer'
import type { ContextToolbarSchema } from '../types'
import { UiIcon } from '../icon'
import NumericControl from '../ui/NumericControl.vue'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import { usePreviewPopover } from '../ui/use-preview-popover'
import CensorEffectPreview from './CensorEffectPreview.vue'

const props = defineProps<{
  schema: ContextToolbarSchema
  locale: 'en' | 'ru'
  recentColors: readonly SrgbColor[]
}>()
const emit = defineEmits<{
  change: [id: string, value: string]
  eyedropper: [id: string]
}>()
type Menu = 'region' | 'parameter'
const open = ref<Menu>()
const panel = ref<HTMLElement>()
const triggers = new Map<Menu, HTMLButtonElement>()
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const control = (id: string) => props.schema.controls.find((item) => item.id === id)
const mixed = (id: string) => Boolean(control(id)?.mixed)
const value = (id: string) => {
  const item = control(id)
  return item && 'value' in item ? String(item.value) : ''
}
const disabled = computed(() => Boolean(props.schema.disabled || props.schema.controls.some((item) => item.disabled)))
const mode = computed(() => mixed('censorMode') ? undefined : value('censorMode'))
const numeric = computed(() => {
  const item = control(mode.value === 'pixelate' ? 'censorBlockSize' : 'censorBlurStrength')
  return mode.value !== 'solid' && mode.value && item?.kind === 'range' ? item : undefined
})
const presets = computed(() => mode.value === 'pixelate' ? [6, 12, 24] : [4, 12, 24])
const modes = computed(() => [
  { id: 'pixelate' as const, label: text('Pixelate', 'Мозаика') },
  { id: 'blur' as const, label: text('Blur', 'Размытие') },
  { id: 'solid' as const, label: text('Solid fill', 'Заливка') },
])
const regions = computed(() => [
  { id: 'rectangle', label: text('Rectangle', 'Прямоугольник'), hint: text('Drag a rectangular area', 'Потяните по диагонали области') },
  { id: 'freeform', label: text('Freeform outline', 'Свободный контур'), hint: text('Draw around the data', 'Обведите данные, удерживая кнопку мыши') },
])
const regionName = computed(() => mixed('censorRegion') ? '—' : regions.value.find((item) => item.id === value('censorRegion'))?.label ?? '—')
const parameterLabel = computed(() => mode.value === 'solid' ? text('Colour', 'Цвет') : numeric.value?.label ?? '')
const summary = computed(() => {
  const item = numeric.value
  if (!item) return parameterLabel.value
  const number = item.mixed ? '—' : new Intl.NumberFormat(props.locale, { maximumFractionDigits: 1 }).format(item.value)
  return mode.value === 'pixelate'
    ? `${text('Pixels', 'Пиксели')}: ${number} px`
    : `${text('Strength', 'Сила')}: ${number}`
})
const position = usePreviewPopover(
  () => open.value ? triggers.get(open.value) : undefined,
  () => open.value ? panel.value : undefined,
)
function show(
  menu: Menu,
  shown: boolean,
  restoreFocus = true,
): void {
  if (shown && disabled.value) return
  if (!shown && open.value !== menu) return
  open.value = shown ? menu : undefined
  void nextTick(() => {
    if (shown) {
      const target = panel.value?.querySelector<HTMLElement>('[aria-pressed="true"]')
        ?? panel.value?.querySelector<HTMLElement>('input:not(:disabled)')
        ?? panel.value?.querySelector<HTMLElement>('button:not(:disabled)')
      target?.focus({ preventScroll: true })
    } else if (restoreFocus) triggers.get(menu)?.focus({ preventScroll: true })
  })
}
function change(
  id: string,
  next: string,
): void {
  if (!disabled.value && control(id)) emit('change', id, next)
}
function chooseMode(next: string): void {
  if (open.value) show(open.value, false, false)
  if (mixed('censorMode') || value('censorMode') !== next) change('censorMode', next)
}
function chooseRegion(next: string): void {
  if (mixed('censorRegion') || value('censorRegion') !== next) change('censorRegion', next)
  show('region', false)
}
function keydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !open.value) return
  event.preventDefault()
  event.stopPropagation()
  show(open.value, false)
}
function presetKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || !(event.target instanceof Element)) return
  const button = event.target.closest<HTMLButtonElement>('.cs-numeric-presets button')
  if (!button || button.disabled) return
  // NumericControl treats Enter as a field commit. Activate the focused preset
  // before that handler, and suppress a second native activation.
  event.preventDefault()
  event.stopPropagation()
  button.click()
}
function sample(): void {
  open.value = undefined
  emit('eyedropper', 'censorSolidColor')
}
function outside(
  menu: Menu,
  event: MouseEvent,
): void {
  if (event.target instanceof Node && triggers.get(menu)?.contains(event.target)) return
  show(menu, false)
}
watch([disabled, mode], () => {
  if (
    open.value &&
    (disabled.value ||
      open.value === 'parameter')
  ) show(open.value, false, false)
})
</script>

<template>
  <div
    class="cs-censor-toolbar"
    data-tool-settings="censor"
    @keydown="keydown"
    @keydown.enter.stop
  >
    <button
      :ref="element => { if (element) triggers.set('region', element as HTMLButtonElement) }"
      type="button"
      class="cs-censor-trigger cs-censor-region"
      :disabled="disabled"
      :aria-label="text('Region shape', 'Форма области')"
      :title="`${text('Region shape', 'Форма области')}: ${regionName}`"
      :aria-expanded="open === 'region'"
      aria-haspopup="dialog"
      @click="show('region', open !== 'region')"
    >
      <svg
        class="cs-censor-region-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path v-if="!mixed('censorRegion') && value('censorRegion') === 'freeform'" d="M4 8Q6 2 11 6T20 8Q23 14 18 19T9 18Q2 21 4 8Z" />
        <rect
          v-else
          x="3"
          y="5"
          width="18"
          height="14"
          rx="1"
        />
      </svg>
      <span>{{ regionName }}</span><UiIcon name="chevronDown" />
    </button>
    <div
      class="cs-censor-effects"
      role="group"
      :aria-label="text('Effect', 'Эффект')"
    >
      <button
        v-for="effect in modes"
        :key="effect.id"
        type="button"
        class="cs-censor-effect"
        :disabled="disabled"
        :aria-label="effect.label"
        :aria-pressed="mode === effect.id"
        @click="chooseMode(effect.id)"
      >
        <CensorEffectPreview :mode="effect.id" />
        <span>{{ effect.label }}</span>
      </button>
    </div>
    <button
      v-if="numeric || mode === 'solid'"
      :ref="element => { if (element) triggers.set('parameter', element as HTMLButtonElement) }"
      type="button"
      class="cs-censor-trigger cs-censor-parameter"
      :disabled="disabled"
      :aria-label="parameterLabel"
      :title="summary"
      :aria-expanded="open === 'parameter'"
      aria-haspopup="dialog"
      @click="show('parameter', open !== 'parameter')"
    >
      <span
        v-if="mode === 'solid'"
        class="cs-simple-color-current"
        :class="{ 'is-mixed': mixed('censorSolidColor') }"
        :style="{ backgroundColor: mixed('censorSolidColor') ? undefined : value('censorSolidColor') }"
      >{{ mixed('censorSolidColor') ? '—' : '' }}</span>
      <span>{{ summary }}</span><UiIcon name="chevronDown" />
    </button>
    <NPopover
      v-for="menu in ['region', 'parameter'] as const"
      :key="menu"
      :show="open === menu"
      trigger="manual"
      placement="top-start"
      :x="position?.left ?? 0"
      :y="position?.top ?? 0"
      overlap
      :flip="false"
      :show-arrow="false"
      raw
      to=".cs-overlay-root"
      @clickoutside="outside(menu, $event)"
    >
      <div
        v-if="open === menu"
        :ref="element => { panel = element as HTMLElement | undefined }"
        class="cs-censor-popover"
        role="dialog"
        :aria-label="menu === 'region' ? text('Region shape', 'Форма области') : parameterLabel"
        @keydown="keydown"
        @keydown.enter.stop
        @pointerdown.stop
      >
        <template v-if="menu === 'region'">
          <button
            v-for="region in regions"
            :key="region.id"
            class="cs-censor-region-choice"
            type="button"
            :disabled="disabled"
            :aria-label="region.label"
            :aria-pressed="!mixed('censorRegion') && value('censorRegion') === region.id"
            @click="chooseRegion(region.id)"
          >
            <svg
              class="cs-censor-region-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect
                v-if="region.id === 'rectangle'"
                x="3"
                y="5"
                width="18"
                height="14"
                rx="1"
              />
              <path v-else d="M4 8Q6 2 11 6T20 8Q23 14 18 19T9 18Q2 21 4 8Z" />
            </svg>
            <span><strong>{{ region.label }}</strong><small>{{ region.hint }}</small></span>
            <UiIcon v-if="!mixed('censorRegion') && value('censorRegion') === region.id" name="check" />
          </button>
        </template>
        <SimpleColorPicker
          v-else-if="mode === 'solid'"
          :model-value="value('censorSolidColor')"
          v-bind="{ ariaLabel: parameterLabel }"
          :mixed="mixed('censorSolidColor')"
          :disabled="disabled"
          :locale="locale"
          :recent-colors="recentColors"
          :eyedropper="Boolean((control('censorSolidColor') as { eyedropper?: boolean })?.eyedropper)"
          embedded
          @commit="change('censorSolidColor', $event)"
          @dismiss="show(menu, false)"
          @eyedropper="sample"
        />
        <template v-else-if="numeric">
          <NumericControl
            :key="numeric.id"
            :presets="presets"
            :label="numeric.label"
            :value="numeric.value"
            :min="numeric.min"
            :max="numeric.max"
            :step="numeric.step"
            :unit="mode === 'pixelate' ? 'px' : undefined"
            :control-id="numeric.id"
            :mixed="numeric.mixed"
            :disabled="disabled"
            :locale="locale"
            slider
            stepper
            @commit="change(numeric.id, String($event))"
            @keydown.capture="presetKeydown"
          >
            <template #preset="{ value: preset }">
              <CensorEffectPreview :mode="mode === 'pixelate' ? 'pixelate' : 'blur'" :amount="preset" />
              <span>{{ preset }}{{ mode === 'pixelate' ? ' px' : '' }}</span>
            </template>
          </NumericControl>
        </template>
      </div>
    </NPopover>
  </div>
</template>
