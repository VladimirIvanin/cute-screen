<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { NPopover } from 'naive-ui'
import { usePreviewPopover } from '../ui/use-preview-popover'
import {
  SHAPE_CATALOG,
  shapeGeometry,
  shapePathSvg,
  mapShapePath,
  type ShapePreset,
  type SrgbColor,
} from '@cute-screen/editor-renderer'
import type {
  ContextToolbarSchema,
  ShapeFill,
} from '../types'
import { UiIcon } from '../icon'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import UiSeparator from '../ui/UiSeparator.vue'
import ShapeNumericControl from './ShapeNumericControl.vue'

const props = defineProps<{
  schema: ContextToolbarSchema
  locale: 'en' | 'ru'
  recentColors: readonly SrgbColor[]
}>()
const emit = defineEmits<{
  change: [id: string, value: string]
  action: [id: string]
  eyedropper: [id: string]
}>()
type Menu = 'geometry' | 'fill' | 'stroke' | 'appearance'
const menus: readonly Menu[] = ['geometry', 'fill', 'stroke', 'appearance']
const open = ref<Menu>()
const host = ref<HTMLElement>()
const panel = ref<HTMLElement>()
const triggers = new Map<Menu, HTMLButtonElement>()
const popoverPosition = usePreviewPopover(
  () => open.value ? triggers.get(open.value) : undefined,
  () => open.value ? panel.value : undefined,
)
function text(
  en: string,
  ru: string,
): string {
  return props.locale === 'ru' ? ru : en
}
const control = (id: string) => props.schema.controls.find((item) => item.id === id)
const mixed = (id: string) => Boolean(control(id)?.mixed)
function canSample(id: string): boolean {
  const item = control(id)
  return item?.kind === 'color' && Boolean(item.eyedropper)
}
function value(id: string): string {
  const item = control(id)
  return item && 'value' in item ? String(item.value) : ''
}
const disabled = computed(() => Boolean(props.schema.disabled) || props.schema.controls.some((item) => item.disabled && item.id === 'color'))
const shape = computed(() => mixed('shapeKind') ? 'mixed' : value('shapeKind'))
const fill = computed(() => props.schema.shape?.fill ?? null)
const selectedPreset = computed(() =>
  shape.value === 'rectangle' && Number(value('cornerRadius')) > 0 ? 'roundedRectangle' : shape.value)
const shapeNames = computed(() => {
  const names = SHAPE_CATALOG.map((entry) => [entry.id, text(entry.en, entry.ru)])
  return Object.fromEntries(names)
})
function thumbnail(entry: ShapePreset): string {
  const geometry = shapeGeometry(
    entry.shape,
    24,
    entry.shape === 'oval' ? 16 : 24,
    { cornerRadius: entry.cornerRadius ? 5 : 0 },
  )
  return shapePathSvg(mapShapePath([...geometry.outline, ...geometry.details], 1, 1, 4, entry.shape === 'oval' ? 8 : 4))
}
function gridKeydown(event: KeyboardEvent): void {
  const grid = event.currentTarget as HTMLElement
  const buttons = Array.from(grid.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
  const index = buttons.indexOf(event.target as HTMLButtonElement)
  if (index < 0) return
  const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 7
  const movement: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }
  if (
    !(event.key in movement) &&
    event.key !== 'Home' &&
    event.key !== 'End'
  ) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + movement[event.key]!))
  buttons[next]?.focus()
}
const fillNames = computed(() => ({
  none: text('No fill', 'Без заливки'),
  solid: text('Colour', 'Цвет'),
  linearGradient: text('Linear gradient', 'Линейный градиент'),
  radialGradient: text('Radial gradient', 'Радиальный градиент'),
  pattern: text('Pattern', 'Узор'),
  imageTexture: text('Texture', 'Текстура'),
}))
const blendNames = computed(() => ({
  normal: text('Normal', 'Обычный'),
  multiply: text('Multiply', 'Умножение'),
  screen: text('Screen', 'Экран'),
  overlay: text('Overlay', 'Перекрытие'),
  darken: text('Darken', 'Затемнение'),
  lighten: text('Lighten', 'Осветление'),
  softLight: text('Soft light', 'Мягкий свет'),
  hardLight: text('Hard light', 'Жёсткий свет'),
}))
const labels = computed<Record<Menu, string>>(() => ({
  geometry: text('Shape', 'Форма'),
  fill: text('Fill', 'Заливка'),
  stroke: text('Stroke', 'Обводка'),
  appearance: text('Blending', 'Наложение'),
}))
const summaries = computed<Record<Menu, string>>(() => ({
  geometry: shapeNames.value[selectedPreset.value] ?? '—',
  fill: fill.value ? fillNames.value[fill.value.kind] : '—',
  stroke: `${mixed('color') ? '—' : value('color')} · ${mixed('width') ? '—' : value('width')} px`,
  appearance: `${mixed('layerOpacity') ? '—' : value('layerOpacity')}% · ${mixed('blendMode') ? '—' : blendNames.value[value('blendMode') as keyof typeof blendNames.value]}`,
}))
function paintColor(
  color: SrgbColor,
  opacity: number,
): string {
  return `rgba(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)}, ${color.alpha * opacity})`
}
function fillBackground(paint: ShapeFill | null): string {
  if (
    !paint ||
    paint.kind === 'none' ||
    paint.kind === 'imageTexture'
  ) return ''
  if (paint.kind === 'solid') return paintColor(paint.color, paint.opacity)
  if (paint.kind === 'pattern') {
    const foreground = paintColor(paint.color, paint.opacity)
    const background = paintColor(paint.background, paint.opacity)
    if (paint.pattern === 'dots')
      return `radial-gradient(${foreground} 20%, transparent 25%) 0 0 / 6px 6px ${background}`
    if (paint.pattern === 'grid')
      return `repeating-linear-gradient(0deg, ${foreground} 0 1px, transparent 1px 6px), repeating-linear-gradient(90deg, ${foreground} 0 1px, ${background} 1px 6px)`
    return `repeating-linear-gradient(45deg, ${foreground} 0 2px, ${background} 2px 6px)`
  }
  const stops = paint.stops.map((stop) => `${paintColor(stop.color, paint.opacity)} ${stop.position * 100}%`).join(', ')
  if (paint.kind === 'radialGradient') return `radial-gradient(circle, ${stops})`
  const angle = Math.atan2(paint.end.y - paint.start.y, paint.end.x - paint.start.x) * 180 / Math.PI + 90
  return `linear-gradient(${angle}deg, ${stops})`
}
function show(
  menu: Menu,
  shown = true,
): void {
  if (
    shown &&
    (disabled.value ||
      (menu === 'fill' &&
        props.schema.shape?.fillSupported === false))
  ) return
  const previous = open.value
  open.value = shown ? menu : undefined
  void nextTick(() => {
    if (shown) panel.value?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')?.focus({ preventScroll: true })
    else if (previous) triggers.get(previous)?.focus({ preventScroll: true })
  })
}
function change(
  id: string,
  next: string,
): void {
  if (!disabled.value) emit('change', id, next)
}
function chooseShape(next: string): void {
  change('shapeKind', next)
  if (!['rectangle', 'roundedRectangle', 'star'].includes(next)) show('geometry', false)
}
function keydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  if (open.value) show(open.value, false)
}
function outside(event: PointerEvent): void {
  if (!open.value || !(event.target instanceof Node)) return
  if (host.value?.contains(event.target) || panel.value?.contains(event.target)) return
  if (event.target instanceof Element && event.target.closest('.n-base-select-menu, .n-tooltip')) return
  open.value = undefined
}
function sample(id: string): void {
  open.value = undefined
  emit('eyedropper', id)
}
watch(() => props.schema.shape?.fillSupported, (supported) => {
  if (supported === false && open.value === 'fill') open.value = undefined
})
watch(disabled, (blocked) => {
  if (blocked) open.value = undefined
})
onMounted(() => {
  document.addEventListener('pointerdown', outside, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside, true)
})
</script>

<template>
  <div ref="host" class="cs-shape-toolbar">
    <template v-for="menu in menus" :key="menu">
      <UiSeparator v-if="menu !== 'geometry'" :length="21" />
      <button
        :ref="(element) => { if (element) triggers.set(menu, element as HTMLButtonElement) }"
        class="cs-shape-toolbar-trigger"
        :data-shape-control="menu"
        type="button"
        :disabled="disabled || (menu === 'fill' && schema.shape?.fillSupported === false)"
        :title="`${labels[menu]}: ${summaries[menu]}`"
        :aria-label="`${labels[menu]}: ${summaries[menu]}`"
        :aria-expanded="open === menu"
        aria-haspopup="dialog"
        @click="show(menu, open !== menu)"
        @keydown="keydown"
      >
        <svg
          v-if="menu === 'geometry'"
          viewBox="0 0 32 32"
          aria-hidden="true"
        ><path
          :d="SHAPE_CATALOG.find((entry) => entry.id === selectedPreset) ? thumbnail(SHAPE_CATALOG.find((entry) => entry.id === selectedPreset)!) : 'M6 16h20'"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
        /></svg>
        <span
          v-else-if="menu === 'fill'"
          class="cs-shape-fill-swatch"
          :class="{ 'is-none': fill?.kind === 'none', 'is-mixed': !fill }"
          :style="{ background: fillBackground(fill) }"
          aria-hidden="true"
        ><UiIcon v-if="fill?.kind === 'imageTexture'" name="image"/></span>
        <svg
          v-else-if="menu === 'stroke'"
          viewBox="0 0 32 24"
          aria-hidden="true"
        ><path
          d="M3 12h26"
          :stroke="mixed('color') ? 'currentColor' : value('color')"
          :stroke-width="Math.min(Number(value('width')), 8)"
          stroke-linecap="round"
        /></svg>
        <template v-else><UiIcon name="blendMode"/><span>{{ mixed('layerOpacity') ? '—' : value('layerOpacity') }}%</span></template>
        <UiIcon class="cs-shape-chevron" name="chevronDown"/>
      </button>
      <NPopover

        :show="open === menu"
        trigger="manual"
        placement="top-start"
        :x="popoverPosition?.left ?? 0"
        :y="popoverPosition?.top ?? 0"
        overlap
        :flip="false"
        :show-arrow="false"
        raw
        to=".cs-overlay-root"
      >
        <section
          v-if="open === menu"
          :ref="(element) => { panel = element as HTMLElement | undefined }"
          class="cs-shape-popover"
          :class="{ 'cs-shape-popover--geometry': menu === 'geometry', 'cs-shape-popover--paint': menu === 'fill' || menu === 'stroke' }"
          role="dialog"
          :aria-label="labels[menu]"
          @keydown="keydown"
          @pointerdown.stop
        >
          <strong v-if="menu !== 'geometry'" class="cs-shape-popover-title">{{ labels[menu] }}</strong>
          <template v-if="menu === 'geometry'">
            <div
              class="cs-shape-grid"
              role="group"
              :aria-label="labels.geometry"
              @keydown="gridKeydown"
            >
              <button
                v-for="entry in SHAPE_CATALOG"
                :key="entry.id"
                :data-shape-id="entry.id"
                type="button"
                :title="shapeNames[entry.id]"
                :aria-label="shapeNames[entry.id]"
                :aria-pressed="selectedPreset === entry.id"
                :disabled="disabled"
                @click="chooseShape(entry.id)"
              >
                <svg viewBox="0 0 32 32" aria-hidden="true"><path
                  :d="thumbnail(entry)"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linejoin="round"
                /></svg>
              </button>
            </div>
            <div v-if="shape === 'rectangle' || shape === 'star'" class="cs-shape-dimensions">
              <ShapeNumericControl
                v-if="shape === 'rectangle'"
                :label="text('Corner radius', 'Скругление')"
                control-id="cornerRadius"
                :locale="locale"
                slider
                unit="px"
                :value="Number(value('cornerRadius'))"
                :mixed="mixed('cornerRadius')"
                :min="0"
                :max="200"
                :step="1"
                :disabled="disabled"
                @commit="change('cornerRadius', String($event))"
              />
              <template v-if="shape === 'star'">
                <ShapeNumericControl
                  :label="text('Star points', 'Количество лучей')"
                  :compact-label="text('Points', 'Лучи')"
                  control-id="starPoints"
                  :locale="locale"
                  stepper
                  :value="Number(value('starPoints'))"
                  :mixed="mixed('starPoints')"
                  :min="3"
                  :max="32"
                  :step="1"
                  :disabled="disabled"
                  @commit="change('starPoints', String($event))"
                />
                <ShapeNumericControl
                  :label="text('Inner radius', 'Внутренний радиус')"
                  :compact-label="text('Inner radius', 'Внутр. радиус')"
                  control-id="starInnerRatio"
                  :locale="locale"
                  slider
                  unit="%"
                  :display-scale="100"
                  :value="Number(value('starInnerRatio'))"
                  :mixed="mixed('starInnerRatio')"
                  :min="0.1"
                  :max="0.9"
                  :step="0.01"
                  :disabled="disabled"
                  @commit="change('starInnerRatio', String($event))"
                />
              </template>
            </div>
          </template>
          <template v-if="menu === 'fill'">
            <div
              class="cs-shape-fill-options"
              role="group"
              :aria-label="text('Fill type', 'Тип заливки')"
            >
              <button
                v-for="kind in ['none', 'solid', 'linearGradient', 'radialGradient'] as const"
                :key="kind"
                type="button"
                :aria-pressed="fill?.kind === kind"
                :disabled="disabled"
                @click="change('fillKind', kind)"
              >
                {{ fillNames[kind] }}
              </button>
            </div>
            <p v-if="fill?.kind === 'pattern' || fill?.kind === 'imageTexture'" class="cs-shape-current-fill">{{ fillNames[fill.kind] }}</p>
            <SimpleColorPicker
              v-if="schema.shape?.fillColorEditable !== false"
              :model-value="value('fillColor')"
              :mixed="mixed('fillColor')"
              v-bind="{ ariaLabel: text('Fill colour', 'Цвет заливки') }"
              :recent-colors="recentColors"
              :locale="locale"
              :disabled="disabled"
              :eyedropper="canSample('fillColor')"
              embedded
              @commit="change('fillColor', $event)"
              @dismiss="show(menu, false)"
              @eyedropper="sample('fillColor')"
            />
            <ShapeNumericControl
              v-if="schema.shape?.fillOpacityEditable !== false && fill?.kind !== 'none'"
              :label="text('Fill opacity', 'Непрозрачность заливки')"
              control-id="fillOpacity"
              :locale="locale"
              slider
              unit="%"
              :value="Number(value('fillOpacity'))"
              :mixed="mixed('fillOpacity')"
              :min="0"
              :max="100"
              :step="1"
              :disabled="disabled"
              @commit="change('fillOpacity', String($event))"
            />
            <button
              type="button"
              class="cs-shape-texture-action"
              :disabled="disabled || control('importTexture')?.disabled"
              @click="emit('action', 'importTexture')"
            >
              {{ text('Import texture', 'Импорт текстуры') }}
            </button>
            <button
              v-if="fill?.kind === 'imageTexture'"
              type="button"
              class="cs-shape-texture-action"
              :disabled="disabled"
              @click="emit('action', 'removeTexture')"
            >
              {{ text('Remove texture', 'Удалить текстуру') }}
            </button>
          </template>
          <template v-if="menu === 'stroke'">
            <ShapeNumericControl
              :label="text('Thickness', 'Толщина')"
              control-id="width"
              :locale="locale"
              slider
              unit="px"
              :presets="[1, 2, 4, 8, 16]"
              :value="Number(value('width'))"
              :mixed="mixed('width')"
              :min="1"
              :max="48"
              :step="1"
              :disabled="disabled"
              @commit="change('width', String($event))"
            />
            <SimpleColorPicker
              :model-value="value('color')"
              :mixed="mixed('color')"
              :eyedropper="canSample('color')"
              v-bind="{ ariaLabel: text('Stroke colour', 'Цвет обводки') }"
              :recent-colors="recentColors"
              :locale="locale"
              :disabled="disabled"
              embedded
              @commit="change('color', $event)"
              @dismiss="show(menu, false)"
              @eyedropper="sample('color')"
            />
          </template>
          <template v-if="menu === 'appearance'">
            <ShapeNumericControl
              :label="text('Opacity', 'Непрозрачность')"
              control-id="layerOpacity"
              :locale="locale"
              slider
              unit="%"
              :value="Number(value('layerOpacity'))"
              :mixed="mixed('layerOpacity')"
              :min="0"
              :max="100"
              :step="1"
              :disabled="disabled"
              @commit="change('layerOpacity', String($event))"
            />
            <label class="cs-shape-blend"><span>{{ text('Blend mode', 'Режим наложения') }}</span><select
              :value="mixed('blendMode') ? '' : value('blendMode')"
              :aria-label="text('Blend mode', 'Режим наложения')"
              :disabled="disabled"
              @change="change('blendMode', ($event.target as HTMLSelectElement).value)"
            ><option
              v-if="mixed('blendMode')"
              value=""
              disabled
            >—</option><option
              v-for="(name, mode) in blendNames"
              :key="mode"
              :value="mode"
            >{{ name }}</option></select></label>
          </template>
        </section>
      </NPopover>
    </template>
  </div>
</template>
