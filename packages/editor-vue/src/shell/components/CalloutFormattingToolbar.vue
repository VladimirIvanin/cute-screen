<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
} from 'vue'
import { NPopover } from 'naive-ui'
import {
  calloutPathPoints,
  calloutRoutePreset,
  DEFAULT_CALLOUT_FRAME,
  type CalloutFrame,
  type CalloutMarker,
  type CalloutMarkerStyle,
} from '@cute-screen/editor-renderer'
import type { ContextToolbarSchema } from '../types'
import { UiIcon } from '../icon'
import NumericControl from '../ui/NumericControl.vue'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import UiSelect from '../ui/UiSelect.vue'
import { usePreviewPopover } from '../ui/use-preview-popover'
import { focusPopoverControl } from '../ui/focus-popover-control'
import {
  ownsSurfaceTarget,
  provideTransientSurface,
  useTransientSurface,
} from '../ui/transient-surface'
import { parseHexColor } from '../tools/effects/color'
import TextFormattingToolbar from './TextFormattingToolbar.vue'

const props = defineProps<{ schema: ContextToolbarSchema; locale: 'en' | 'ru' }>()
const emit = defineEmits<{ change: [id: string, value: string] }>()
const surfaceOwner = useTransientSurface() ?? provideTransientSurface()
type Menu = 'route' | 'markers' | 'line' | 'frame' | 'text'
const menus: readonly Menu[] = ['route', 'markers', 'line', 'frame', 'text']
const open = ref<Menu>()
const panel = ref<HTMLElement>()
const triggers = new Map<Menu, HTMLButtonElement>()
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const payload = computed(() => props.schema.callout!)
const frame = computed(() => payload.value.frame ?? {
  ...DEFAULT_CALLOUT_FRAME,
  kind: payload.value.background ? 'card' as const : 'text' as const,
})
const labels = computed<Record<Menu, string>>(() => ({
  route: text('Route', 'Маршрут'),
  markers: text('Endpoints', 'Наконечники'),
  line: text('Line', 'Линия'),
  frame: text('Label', 'Подпись'),
  text: text('Text', 'Текст'),
}))
const routes = computed(() => [
  { value: 'straight', label: text('Straight', 'Прямая') },
  { value: 'corner', label: text('One corner', 'Г-образная') },
  { value: 'elbow', label: text('Stepped', 'Ступенчатая') },
])
const frames = computed(() => [
  { value: 'text', label: text('Plain text', 'Текст') },
  { value: 'outline', label: text('Outline', 'Рамка') },
  { value: 'card', label: text('Card', 'Карточка') },
  { value: 'capsule', label: text('Pill', 'Капсула') },
  { value: 'accent', label: text('Accent', 'Акцент') },
])
const markers = computed(() => [
  { value: 'none', label: text('None', 'Нет') },
  { value: 'circle', label: text('Dot', 'Точка') },
  { value: 'ring', label: text('Ring', 'Кольцо') },
  { value: 'lineArrow', label: text('Open arrow', 'Открытая стрелка') },
  { value: 'solidArrow', label: text('Filled arrow', 'Заполненная стрелка') },
])
const sides = computed(() => [
  { value: 'left', label: text('Left', 'Слева') },
  { value: 'right', label: text('Right', 'Справа') },
  { value: 'top', label: text('Top', 'Сверху') },
  { value: 'bottom', label: text('Bottom', 'Снизу') },
])
const lineStyles = computed(() => [
  { value: 'solid', label: text('Solid', 'Сплошная') },
  { value: 'dashed', label: text('Dashed', 'Пунктир') },
  { value: 'dotted', label: text('Dotted', 'Точки') },
])
const position = usePreviewPopover(
  () => open.value ? triggers.get(open.value) : undefined,
  () => open.value ? panel.value : undefined,
)
const hex = (color: { red: number; green: number; blue: number }) =>
  '#' + [color.red, color.green, color.blue].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
function summary(menu: Menu): string {
  if (props.schema.calloutMixed) return '—'
  if (menu === 'route') {
    if (payload.value.route.path === 'orthogonal') return text('Custom', 'Ручной')
    return routes.value.find((r) => r.value === payload.value.route.path)?.label ?? ''
  }
  if (menu === 'frame') return frames.value.find((r) => r.value === frame.value.kind)?.label ?? ''
  if (menu === 'line') return `${payload.value.stroke.width} px`
  if (menu === 'markers') {
    const start = markers.value.find((r) => r.value === payload.value.targetMarker)?.label ?? ''
    const end = markers.value.find((r) => r.value === payload.value.labelMarker)?.label ?? ''
    return `${start} / ${end}`
  }
  return props.schema.text?.fontSize ? `${props.schema.text.fontSize}` : '—'
}
function show(
  menu: Menu,
  value: boolean,
  restore = true,
): void {
  open.value = value ? menu : undefined
  void nextTick(() => {
    if (value) focusPopoverControl(panel.value)
    else if (restore) triggers.get(menu)?.focus({ preventScroll: true })
  })
}
function keydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !open.value) return
  event.preventDefault()
  event.stopPropagation()
  show(open.value, false)
}
function outside(event: MouseEvent): void {
  if (ownsSurfaceTarget(surfaceOwner, event.target)) return
  if (open.value) show(open.value, false, false)
}
function change(
  id: string,
  value: string,
): void {
  if (!props.schema.disabled) emit('change', id, value)
}
function setFrame(patch: Partial<CalloutFrame>): void {
  change('calloutFrame', JSON.stringify(patch))
}
function setMarkerStyle(
  endpoint: 'target' | 'label',
  patch: CalloutMarkerStyle,
): void {
  const id = endpoint === 'target' ? 'calloutTargetMarkerStyle' : 'calloutLabelMarkerStyle'
  change(id, JSON.stringify(patch))
}
function resetMarkerStyle(endpoint: 'target' | 'label'): void {
  change(endpoint === 'target' ? 'calloutTargetMarkerStyle' : 'calloutLabelMarkerStyle', '{}')
}
function markerColor(
  endpoint: 'target' | 'label',
  value: string,
): void {
  const color = parseHexColor(value)
  if (color) setMarkerStyle(endpoint, { color })
}
function fillColor(value: string): void {
  const fill = parseHexColor(value)
  if (fill) setFrame({ fill })
}
function borderColor(value: string): void {
  const color = parseHexColor(value)
  if (color && frame.value.border) setFrame({ border: { ...frame.value.border, color } })
}
function borderWidth(width: number): void {
  setFrame({ border: width === 0 ? null : { ...DEFAULT_CALLOUT_FRAME.border!, ...frame.value.border, width } })
}
function markerSymbol(value: CalloutMarker): string {
  return ({ none: '—', circle: '●', ring: '○', lineArrow: '‹', solidArrow: '◀' })[value]
}
function routePreview(value: string): string {
  const route = value === 'straight' ? { path: 'straight' as const }
    : value === 'corner' ? { path: 'corner' as const, axis: 'y' as const }
      : { path: 'elbow' as const, elbow: { axis: 'y' as const, offset: 0 } }
  const points = calloutPathPoints({ ...payload.value, attachment: 'left',
    target: { x: 4, y: 26 }, label: { x: 52, y: 6 }, route })
  return points.map((p) => `${p.x},${p.y}`).join(' ')
}
function insert(): void {
  const canvas = triggers.get('route')?.closest('.cs-workbench')
    ?.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')
  change('calloutInsert', '')
  if (open.value) show(open.value, false, false)
  void nextTick(() => canvas?.focus({ preventScroll: true }))
}
watch(() => props.schema.disabled, (disabled) => {
  if (disabled && open.value) show(open.value, false)
})

</script>

<template>
  <div class="cs-tool-formatting-toolbar cs-callout-toolbar" data-tool-settings="callout">
    <button
      v-for="menu in menus"
      :key="menu"
      :ref="element => { if (element) triggers.set(menu, element as HTMLButtonElement) }"
      type="button"
      class="cs-tool-settings-trigger"
      :disabled="schema.disabled"
      :aria-label="labels[menu]"
      :title="`${labels[menu]}: ${summary(menu)}`"
      :aria-expanded="open === menu"
      aria-haspopup="dialog"
      @click="show(menu, open !== menu)"
      @keydown="keydown"
    >
      <span>{{ labels[menu] }}</span><span class="cs-callout-summary">{{ summary(menu) }}</span><UiIcon name="chevronDown" class="cs-tool-settings-chevron"/>
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
      :z-index="55"
      raw
      to=".cs-overlay-root"
      @clickoutside="outside"
    >
      <div
        v-if="open"
        ref="panel"
        class="cs-shape-popover cs-callout-popover"
        :data-cs-surface="surfaceOwner"
        :class="{ 'cs-callout-popover--text': open === 'text' }"
        role="dialog"
        :aria-label="labels[open]"
        @keydown="keydown"
        @pointerdown.stop
      >
        <template v-if="open === 'route'">
          <div class="cs-callout-choices">
            <button
              v-for="route in routes"
              :key="route.value"
              type="button"
              :aria-pressed="calloutRoutePreset(payload.route) === route.value"
              :disabled="schema.disabled"
              @click="change('calloutRoute', route.value)"
            >
              <svg viewBox="0 0 56 32" aria-hidden="true"><polyline
                :points="routePreview(route.value)"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              /></svg><span>{{ route.label }}</span>
            </button>
          </div>
          <button
            v-if="calloutRoutePreset(payload.route) === 'corner'"
            type="button"
            @click="change('calloutFlip', '')"
          >
            {{ text('Flip corner', 'Поменять угол') }}
          </button>
          <button
            v-if="payload.route.path !== 'straight' && !schema.calloutMultiple"
            type="button"
            @click="insert"
          >
            {{ text('Add step', 'Добавить ступень') }}
          </button>
          <template v-if="payload.route.path === 'orthogonal' && !schema.calloutMultiple">
            <button type="button" @click="change('calloutRemoveStep', '')">{{ text('Remove step', 'Удалить ступень') }}</button>
            <button type="button" @click="change('calloutReset', '')">{{ text('Reset route', 'Сбросить маршрут') }}</button>
          </template>
          <label class="cs-callout-field"><span>{{ text('Connect to label', 'Подключение к подписи') }}</span><UiSelect
            :model-value="payload.attachment ?? 'left'"
            v-bind="{ ariaLabel: text('Attachment side', 'Сторона подключения') }"
            :options="sides"
            @update:model-value="change('calloutAttachment', String($event))"
          /></label>
        </template>
        <template v-else-if="open === 'markers'">
          <section
            v-for="endpoint in ['target', 'label'] as const"
            :key="endpoint"
            class="cs-callout-endpoint"
            :aria-label="endpoint === 'target' ? text('At target', 'У цели') : text('At label', 'У подписи')"
          >
            <span>{{ endpoint === 'target' ? text('At target', 'У цели') : text('At label', 'У подписи') }}</span>
            <div class="cs-callout-marker-choices">
              <button
                v-for="marker in markers"
                :key="marker.value"
                type="button"
                :aria-label="marker.label"
                :title="marker.label"
                :aria-pressed="payload[`${endpoint}Marker`] === marker.value"
                @click="change(endpoint === 'target' ? 'calloutTargetMarker' : 'calloutLabelMarker', marker.value)"
              >
                {{ markerSymbol(marker.value as CalloutMarker) }}
              </button>
            </div>
            <details v-if="payload[`${endpoint}Marker`] !== 'none'">
              <summary>{{ text('Size and color', 'Размер и цвет') }}</summary>
              <NumericControl
                :label="text('Size', 'Размер')"
                :value="payload[`${endpoint}MarkerStyle`]?.size ?? Math.max(10, payload.stroke.width * 3)"
                :min="2"
                :max="128"
                :step="1"
                unit="px"
                :locale="locale"
                @commit="setMarkerStyle(endpoint, { size: $event })"
              />
              <SimpleColorPicker
                :model-value="hex(payload[`${endpoint}MarkerStyle`]?.color ?? payload.stroke.color)"
                v-bind="{ ariaLabel: text('Marker color', 'Цвет наконечника') }"
                :locale="locale"
                :eyedropper="false"
                @commit="markerColor(endpoint, $event)"
              />
              <button type="button" @click="resetMarkerStyle(endpoint)">{{ text('Automatic', 'Автоматически') }}</button>
            </details>
          </section>
        </template>
        <template v-else-if="open === 'line'">
          <SimpleColorPicker
            :model-value="hex(payload.stroke.color)"
            v-bind="{ ariaLabel: text('Line color', 'Цвет линии') }"
            :locale="locale"
            :eyedropper="false"
            @commit="change('color', $event)"
          />
          <NumericControl
            :label="text('Width', 'Толщина')"
            :value="payload.stroke.width"
            :min="1"
            :max="24"
            :step="1"
            unit="px"
            :locale="locale"
            @commit="change('width', String($event))"
          />
          <div class="cs-callout-marker-choices">
            <button
              v-for="style in lineStyles"
              :key="style.value"
              type="button"
              :aria-pressed="payload.stroke.style === style.value"
              @click="change('strokeStyle', style.value)"
            >
              {{ style.label }}
            </button>
          </div>
        </template>
        <template v-else-if="open === 'frame'">
          <div class="cs-callout-choices cs-callout-frame-choices">
            <button
              v-for="option in frames"
              :key="option.value"
              type="button"
              :aria-pressed="frame.kind === option.value"
              @click="setFrame({ kind: option.value as CalloutFrame['kind'] })"
            >
              <span
                class="cs-callout-frame-preview"
                :data-frame="option.value"
                aria-hidden="true"
              >Aa</span>{{ option.label }}
            </button>
          </div>
          <template v-if="frame.kind !== 'text'">
            <SimpleColorPicker
              v-if="frame.kind === 'card' || frame.kind === 'capsule'"
              :model-value="hex(frame.fill)"
              v-bind="{ ariaLabel: text('Fill color', 'Цвет подложки') }"
              :locale="locale"
              :eyedropper="false"
              @commit="fillColor"
            />
            <NumericControl
              :label="text('Padding', 'Отступ')"
              :value="frame.padding"
              :min="0"
              :max="256"
              :step="1"
              unit="px"
              :locale="locale"
              @commit="setFrame({ padding: $event })"
            />
            <NumericControl
              v-if="frame.kind !== 'capsule' && frame.kind !== 'accent'"
              :label="text('Radius', 'Скругление')"
              :value="frame.radius"
              :min="0"
              :max="256"
              :step="1"
              unit="px"
              :locale="locale"
              @commit="setFrame({ radius: $event })"
            />
            <NumericControl
              :label="frame.kind === 'accent' ? text('Accent width', 'Толщина акцента') : text('Border width', 'Толщина рамки')"
              :value="frame.border?.width ?? 0"
              :min="0"
              :max="24"
              :step="1"
              unit="px"
              :locale="locale"
              @commit="borderWidth"
            />
            <SimpleColorPicker
              v-if="frame.border"
              :model-value="hex(frame.border.color)"
              v-bind="{ ariaLabel: text('Border color', 'Цвет рамки') }"
              :locale="locale"
              :eyedropper="false"
              @commit="borderColor"
            />
          </template>
        </template>
        <TextFormattingToolbar
          v-else-if="schema.text"
          :text="schema.text"
          :disabled="schema.disabled"
          :title="schema.title"
          :picker-locale="locale"
          variant="bottom"
          @change="change"
        />
      </div>
    </NPopover>
  </div>
</template>
