<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
} from 'vue'
import { NPopover } from 'naive-ui'
import {
  calloutRoutePreset,
  DEFAULT_CALLOUT_FRAME,
  type CalloutFrame,
} from '@cute-screen/editor-renderer'
import type {
  ContextToolbarSchema,
  IconName,
} from '../types'
import { UiIcon } from '../icon'
import NumericControl from '../ui/NumericControl.vue'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import { usePreviewPopover } from '../ui/use-preview-popover'
import { focusPopoverControl } from '../ui/focus-popover-control'
import {
  ownsSurfaceTarget,
  provideTransientSurface,
  useTransientSurface,
} from '../ui/transient-surface'
import { parseHexColor } from '../tools/effects/color'
import TextFormattingToolbar from './TextFormattingToolbar.vue'
import CalloutRouteSettings from './CalloutRouteSettings.vue'
import CalloutEndpointSettings from './CalloutEndpointSettings.vue'
import CalloutMarkerPreview from './CalloutMarkerPreview.vue'
import ArrowStylePreview from './ArrowStylePreview.vue'

const props = defineProps<{ schema: ContextToolbarSchema; locale: 'en' | 'ru' }>()
const emit = defineEmits<{ change: [id: string, value: string] }>()
const surfaceOwner = useTransientSurface() ?? provideTransientSurface()
type Menu = 'route' | 'markers' | 'line' | 'frame' | 'text'
const menus: readonly Menu[] = ['route', 'markers', 'line', 'frame', 'text']
const icons: Record<Menu, IconName> = {
  route: 'callout', markers: 'arrow', line: 'line', frame: 'textBackground', text: 'text',
}
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
  { value: 'straight', label: text('Line', 'Линия') },
  { value: 'corner', label: text('Stepped', 'Ступенчатая') },
])
const routeCategory = computed(() => calloutRoutePreset(payload.value.route) === 'straight' ? 'straight' : 'corner')
const routePreview = computed(() => payload.value.route.path === 'quadratic' ? 'curve'
  : routeCategory.value === 'straight' ? 'straight' : 'elbow')
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
    if (payload.value.route.path === 'quadratic') return text('Curve', 'Кривая')
    return routes.value.find((r) => r.value === routeCategory.value)?.label ?? ''
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
      :disabled="schema.disabled ?? false"
      :aria-label="labels[menu]"
      :aria-description="summary(menu)"
      :title="`${labels[menu]}: ${summary(menu)}`"
      :aria-expanded="open === menu"
      aria-haspopup="dialog"
      @click="show(menu, open !== menu)"
      @keydown="keydown"
    >
      <template v-if="schema.calloutMixed">
        <UiIcon :name="icons[menu]"/>
        <span class="cs-callout-summary">—</span>
      </template>
      <ArrowStylePreview
        v-else-if="menu === 'route'"
        class="cs-callout-route-preview"
        kind="path"
        :value="routePreview"
      />
      <span v-else-if="menu === 'markers'" class="cs-callout-markers-preview">
        <CalloutMarkerPreview :marker="payload.targetMarker" start/>
        <CalloutMarkerPreview :marker="payload.labelMarker"/>
      </span>
      <svg
        v-else-if="menu === 'line'"
        class="cs-callout-stroke-preview"
        viewBox="0 0 36 18"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M3 9h30"
          fill="none"
          stroke="currentColor"
          :stroke-width="Math.min(payload.stroke.width, 7)"
          stroke-linecap="round"
          :stroke-dasharray="payload.stroke.style === 'dashed' ? '7 4' : payload.stroke.style === 'dotted' ? '1 4' : undefined"
        />
      </svg>
      <UiIcon v-else :name="menu === 'frame' ? 'textBackground' : 'text'"/>
      <span v-if="!schema.calloutMixed && (menu === 'line' || menu === 'text')" class="cs-callout-summary">{{ summary(menu) }}</span>
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
        :class="{ 'cs-callout-popover--text': open === 'text', 'cs-callout-popover--markers': open === 'markers' }"
        role="dialog"
        :aria-label="labels[open]"
        @keydown="keydown"
        @pointerdown.stop
      >
        <CalloutRouteSettings
          v-if="open === 'route'"
          :payload="payload"
          :locale="locale"
          :disabled="schema.disabled ?? false"
          :mixed="schema.calloutMixed ?? false"
          :multiple="schema.calloutMultiple ?? false"
          @change="change"
          @insert="insert"
        />
        <CalloutEndpointSettings
          v-else-if="open === 'markers'"
          :payload="payload"
          :locale="locale"
          :disabled="schema.disabled ?? false"
          :mixed="schema.calloutMixed ?? false"
          @change="change"
        />
        <template v-else-if="open === 'line'">
          <div class="cs-callout-choices cs-callout-line-choices">
            <button
              v-for="style in lineStyles"
              :key="style.value"
              type="button"
              :aria-pressed="!schema.calloutMixed && payload.stroke.style === style.value"
              :disabled="schema.disabled ?? false"
              @click="change('strokeStyle', style.value)"
            >
              <svg
                viewBox="0 0 56 20"
                aria-hidden="true"
                focusable="false"
              ><path
                d="M4 10h48"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                :stroke-dasharray="style.value === 'dashed' ? '7 4' : style.value === 'dotted' ? '1 4' : undefined"
              /></svg>
              <span>{{ style.label }}</span>
            </button>
          </div>
          <div class="cs-callout-line-properties">
            <NumericControl
              :label="text('Thickness', 'Толщина')"
              :value="payload.stroke.width"
              :min="1"
              :max="24"
              :step="1"
              unit="px"
              :locale="locale"
              :disabled="schema.disabled ?? false"
              :mixed="schema.calloutMixed ?? false"
              @commit="change('width', String($event))"
            />
            <SimpleColorPicker
              :model-value="hex(payload.stroke.color)"
              v-bind="{ ariaLabel: text('Line color', 'Цвет линии') }"
              :locale="locale"
              :eyedropper="false"
              :disabled="schema.disabled ?? false"
              :mixed="schema.calloutMixed ?? false"
              @commit="change('color', $event)"
            />
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
          :disabled="schema.disabled ?? false"
          :title="schema.title"
          :picker-locale="locale"
          variant="bottom"
          @change="change"
        />
      </div>
    </NPopover>
  </div>
</template>
