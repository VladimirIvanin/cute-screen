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
type Menu = 'loupeZoom' | 'loupeSize' | 'loupeShape' | 'loupeBorderWidth'
const menus: readonly Menu[] = ['loupeZoom', 'loupeSize', 'loupeShape', 'loupeBorderWidth']
const open = ref<Menu>()
const panel = ref<HTMLElement>()
const triggers = new Map<Menu, HTMLButtonElement>()
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const control = (id: string) => props.schema.controls.find((item) => item.id === id)
const value = (id: string) => {
  const item = control(id)
  return item && 'value' in item ? String(item.value) : ''
}
const mixed = (id: string) => Boolean(control(id)?.mixed)
const disabled = computed(() => Boolean(props.schema.disabled || props.schema.controls.some((item) => item.disabled)))
const position = usePreviewPopover(
  () => open.value ? triggers.get(open.value) : undefined,
  () => open.value ? panel.value : undefined,
)
const labels = computed<Record<Menu, string>>(() => ({
  loupeZoom: text('Zoom', 'Увеличение'),
  loupeSize: text('Size', 'Размер'),
  loupeShape: text('Shape', 'Форма'),
  loupeBorderWidth: text('Border', 'Обводка'),
}))
const shapes = computed(() => [
  { id: 'circle', name: text('Circle', 'Круг') },
  { id: 'rectangle', name: text('Rectangle', 'Прямоугольник') },
])
const shapeName = computed(() => mixed('loupeShape') ? '—' : shapes.value.find((shape) => shape.id === value('loupeShape'))?.name ?? '—')
function summary(menu: Menu): string {
  if (menu === 'loupeShape') return shapeName.value
  if (mixed(menu)) return '—'
  const number = new Intl.NumberFormat(props.locale, { maximumFractionDigits: 1 }).format(Number(value(menu)))
  return `${number}${menu === 'loupeZoom' ? '×' : ' px'}`
}
function numeric(menu: Menu) {
  const item = control(menu)
  return item?.kind === 'range' ? item : undefined
}
function show(
  menu: Menu,
  shown: boolean,
  restoreFocus = true,
): void {
  if (shown && disabled.value) return
  if (!shown && open.value !== menu) return
  open.value = shown ? menu : undefined
  void nextTick(() => {
    if (shown) focusPopoverControl(panel.value)
    else if (restoreFocus) triggers.get(menu)?.focus({ preventScroll: true })
  })
}
function change(
  id: string,
  next: string,
): void {
  if (!disabled.value) emit('change', id, next)
}
function chooseShape(next: string): void {
  change('loupeShape', next)
  show('loupeShape', false)
}
function keydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !open.value) return
  event.preventDefault()
  event.stopPropagation()
  show(open.value, false)
}
function sample(): void {
  open.value = undefined
  emit('eyedropper', 'loupeBorderColor')
}
watch(disabled, (blocked) => {
  if (blocked) open.value = undefined
})
</script>

<template>
  <div class="cs-tool-formatting-toolbar cs-loupe-toolbar" data-tool-settings="loupe">
    <button
      v-for="menu in menus"
      :key="menu"
      :ref="element => { if (element) triggers.set(menu, element as HTMLButtonElement) }"
      type="button"
      class="cs-tool-settings-trigger"
      :data-loupe-control="menu"
      :disabled="disabled"
      :aria-label="labels[menu]"
      :title="`${labels[menu]}: ${summary(menu)}`"
      :aria-expanded="open === menu"
      aria-haspopup="dialog"
      @click="show(menu, open !== menu)"
      @keydown="keydown"
    >
      <span
        v-if="menu === 'loupeShape' && !mixed(menu)"
        class="cs-loupe-shape-preview"
        :class="{ 'is-circle': value(menu) === 'circle' }"
        aria-hidden="true"
      />
      <span
        v-else-if="menu === 'loupeBorderWidth'"
        class="cs-loupe-border-preview"
        :class="{ 'is-mixed': mixed('loupeBorderColor') }"
        :style="{ borderColor: mixed('loupeBorderColor') ? undefined : value('loupeBorderColor') }"
        aria-hidden="true"
      />
      <span v-if="menu !== 'loupeShape' || mixed(menu)">{{ summary(menu) }}</span>
      <UiIcon name="chevronDown"/>
    </button>
    <NPopover
      v-for="menu in menus"
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
      @clickoutside="show(menu, false, false)"
    >
      <div
        v-if="open === menu"
        :ref="element => { panel = element as HTMLElement | undefined }"
        class="cs-shape-popover cs-loupe-popover"
        :class="{ 'cs-shape-popover--paint': menu === 'loupeBorderWidth' }"
        role="dialog"
        :aria-label="labels[menu]"
        @keydown="keydown"
        @pointerdown.stop
      >
        <div v-if="menu === 'loupeShape'" class="cs-tool-settings-choices">
          <button
            v-for="shape in shapes"
            :key="shape.id"
            type="button"
            class="cs-loupe-choice"
            :disabled="disabled"
            :aria-pressed="!mixed(menu) && value(menu) === shape.id"
            @click="chooseShape(shape.id)"
          >
            {{ shape.name }}
          </button>
        </div>
        <NumericControl
          v-else
          :label="control(menu)?.label ?? labels[menu]"
          :value="numeric(menu)?.value ?? 0"
          :min="numeric(menu)?.min ?? 0"
          :max="numeric(menu)?.max"
          :step="numeric(menu)?.step ?? 1"
          :unit="menu === 'loupeZoom' ? '×' : 'px'"
          :presets="menu === 'loupeZoom' ? [1, 2, 4, 8, 16] : menu === 'loupeSize' ? [64, 128, 256, 512] : [0, 1, 2, 4, 8]"
          :control-id="menu"
          :mixed="mixed(menu)"
          :disabled="disabled"
          :locale="locale"
          slider
          stepper
          @commit="change(menu, String($event))"
        />
        <template v-if="menu === 'loupeBorderWidth'">
          <SimpleColorPicker
            :model-value="value('loupeBorderColor')"
            v-bind="{ ariaLabel: text('Border color', 'Цвет рамки') }"
            :mixed="mixed('loupeBorderColor')"
            :disabled="disabled"
            :locale="locale"
            :recent-colors="recentColors"
            :eyedropper="Boolean((control('loupeBorderColor') as { eyedropper?: boolean })?.eyedropper)"
            embedded
            @commit="change('loupeBorderColor', $event)"
            @dismiss="show(menu, false)"
            @eyedropper="sample"
          />
          <button
            type="button"
            class="cs-loupe-choice"
            :disabled="disabled"
            :aria-pressed="mixed('loupeShadow') ? 'mixed' : value('loupeShadow') === 'on'"
            @click="change('loupeShadow', value('loupeShadow') === 'on' ? 'off' : 'on')"
          >
            {{ text('Shadow', 'Тень') }}
          </button>
        </template>
      </div>
    </NPopover>
  </div>
</template>
