<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
} from 'vue'
import { NPopover } from 'naive-ui'
import type { ContextToolbarSchema } from '../types'
import type { SrgbColor } from '@cute-screen/editor-renderer'
import { UiIcon } from '../icon'
import NumericControl from '../ui/NumericControl.vue'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import { numericPresentation } from '../ui/numeric-presentation'
import { usePreviewPopover } from '../ui/use-preview-popover'
import { focusPopoverControl } from '../ui/focus-popover-control'

const props = defineProps<{
  schema: ContextToolbarSchema
  locale: 'en' | 'ru'
  recentColors: readonly SrgbColor[]
}>()
const emit = defineEmits<{
  change: [id: string, value: string]
  eyedropper: [id: string]
}>()
type Menu = 'imageRadius' | 'imageBorderWidth' | 'imageOpacity'
const menus: readonly Menu[] = ['imageRadius', 'imageBorderWidth', 'imageOpacity']
const open = ref<Menu>()
const panel = ref<HTMLElement>()
const triggers = new Map<Menu, HTMLButtonElement>()
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const control = (id: string) => props.schema.controls.find((item) => item.id === id)
const numeric = (id: string) => {
  const item = control(id)
  return item?.kind === 'range' ? item : undefined
}
const color = computed(() => {
  const item = control('imageBorderColor')
  return item?.kind === 'color' ? item : undefined
})
const blocked = (id: string) => Boolean(props.schema.disabled || control(id)?.disabled)
const labels = computed<Record<Menu, string>>(() => ({
  imageRadius: text('Radius', 'Скругление'),
  imageBorderWidth: text('Border', 'Рамка'),
  imageOpacity: text('Opacity', 'Непрозрачность'),
}))
const position = usePreviewPopover(
  () => open.value ? triggers.get(open.value) : undefined,
  () => open.value ? panel.value : undefined,
)
function summary(menu: Menu): string {
  const item = numeric(menu)
  if (!item || item.mixed) return '—'
  if (menu === 'imageBorderWidth' && item.value === 0) return text('none', 'нет')
  const value = menu === 'imageOpacity' ? item.value * 100 : item.value
  return `${new Intl.NumberFormat(props.locale, { maximumFractionDigits: 1 }).format(value)}${menu === 'imageOpacity' ? '%' : ' px'}`
}
function show(
  menu: Menu,
  shown: boolean,
  restoreFocus = true,
): void {
  if (shown && blocked(menu)) return
  if (!shown && open.value !== menu) return
  open.value = shown ? menu : undefined
  void nextTick(() => {
    if (shown) focusPopoverControl(panel.value)
    else if (restoreFocus) triggers.get(menu)?.focus({ preventScroll: true })
  })
}
function keydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !open.value) return
  event.preventDefault()
  event.stopPropagation()
  show(open.value, false)
}
function change(
  id: string,
  value: string,
): void {
  if (!blocked(id)) emit('change', id, value)
}
function sample(): void {
  if (blocked('imageBorderColor')) return
  open.value = undefined
  emit('eyedropper', 'imageBorderColor')
}
watch(() => open.value && blocked(open.value), (disabled) => {
  if (disabled) open.value = undefined
})
</script>

<template>
  <div class="cs-tool-formatting-toolbar cs-image-toolbar" data-tool-settings="image">
    <button
      v-for="menu in menus"
      :key="menu"
      :ref="element => { if (element) triggers.set(menu, element as HTMLButtonElement) }"
      type="button"
      class="cs-tool-settings-trigger"
      :data-image-control="menu"
      :disabled="blocked(menu)"
      :aria-label="labels[menu]"
      :title="`${labels[menu]}: ${summary(menu)}`"
      :aria-expanded="open === menu"
      aria-haspopup="dialog"
      @click="show(menu, open !== menu)"
      @keydown="keydown"
    >
      <span
        v-if="menu === 'imageBorderWidth'"
        class="cs-image-border-preview"
        :class="{ 'is-mixed': color?.mixed, 'is-none': !numeric(menu)?.mixed && numeric(menu)?.value === 0 }"
        :style="{ borderColor: color?.mixed ? undefined : color?.value }"
        aria-hidden="true"
      />
      <span>{{ labels[menu] }}</span>
      <span class="cs-image-setting-value">{{ summary(menu) }}</span>
      <UiIcon name="chevronDown" class="cs-tool-settings-chevron"/>
    </button>
    <NPopover
      :show="Boolean(open)"
      trigger="manual"
      placement="top-start"
      :x="position?.left ?? 0"
      :y="position?.top ?? 0"
      overlap
      :flip="false"
      :show-arrow="false"
      raw
      to=".cs-overlay-root"
      @clickoutside="open && show(open, false, false)"
    >
      <div
        v-if="open"
        ref="panel"
        class="cs-shape-popover cs-image-popover"
        role="dialog"
        :aria-label="labels[open]"
        @keydown="keydown"
        @pointerdown.stop
      >
        <NumericControl
          v-if="numeric(open)"
          :key="open"
          :label="numeric(open)!.label"
          :value="numeric(open)!.value"
          :min="numeric(open)!.min"
          :max="numeric(open)!.max"
          :step="numeric(open)!.step"
          :control-id="open"
          :mixed="numeric(open)!.mixed"
          :disabled="blocked(open)"
          :locale="locale"
          v-bind="numericPresentation(numeric(open)!)"
          @commit="change(open!, String($event))"
        />
        <SimpleColorPicker
          v-if="open === 'imageBorderWidth' && color"
          :model-value="color.value"
          v-bind="{ ariaLabel: text('Border color', 'Цвет рамки') }"
          :mixed="color.mixed ?? false"
          :disabled="blocked(color.id)"
          :locale="locale"
          :recent-colors="recentColors"
          :eyedropper="color.eyedropper ?? true"
          embedded
          @commit="change('imageBorderColor', $event)"
          @dismiss="show('imageBorderWidth', false)"
          @eyedropper="sample"
        />
      </div>
    </NPopover>
  </div>
</template>
