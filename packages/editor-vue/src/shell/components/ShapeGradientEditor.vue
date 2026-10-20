<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import type {
  SrgbColor,
  LinearGradientPaint,
} from '@cute-screen/editor-renderer'
import { rotateGradientFill } from '@cute-screen/editor-renderer'
import { UiIcon } from '../icon'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import ShapeNumericControl from './ShapeNumericControl.vue'
import {
  angleGradient,
  colorCss,
  gradientAngle,
  gradientStrip,
  interpolateStop,
  reverseGradient,
  type LinearFill,
  type GradientStop,
} from '../ui/shape-gradient'
import { parseHexColor } from '../tools/effects/color'

const props = defineProps<{
  compact?: boolean
  hideDirection?: boolean
  geometry?: { readonly width: number; readonly height: number } | undefined
  selectedIndex?: number
  fill: LinearFill
  disabled: boolean
  locale: 'ru' | 'en'
  recentColors: readonly SrgbColor[]
}>()
const emit = defineEmits<{
  commit: [fill: LinearFill]
  preview: [fill: LinearFill]
  cancel: []
  dismiss: []
  select: [index: number]
}>()
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const host = ref<HTMLElement>()
const track = ref<HTMLElement>()
const selected = ref(props.selectedIndex ?? 0)
watch(() => props.selectedIndex, (value) => {
  if (value !== undefined) selected.value = Math.max(0, Math.min(props.fill.stops.length - 1, value))
})
watch(selected, (value) => emit('select', value))
const draft = ref<LinearFill>()
const current = computed(() => draft.value ?? props.fill)
const stop = computed<GradientStop>(() => current.value.stops[selected.value] ?? current.value.stops[0]!)
const hex = computed(() => '#' + [stop.value.color.red, stop.value.color.green, stop.value.color.blue].map((n) => Math.round(n * 255).toString(16).padStart(2, '0')).join(''))
const angle = computed(() => {
  if (!props.geometry) return gradientAngle(current.value)
  const dx = (current.value.end.x - current.value.start.x) * props.geometry.width
  const dy = (current.value.end.y - current.value.start.y) * props.geometry.height
  return (Math.round(Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360
})
function setAngle(value: number): void {
  if (!props.geometry) return commit(angleGradient(current.value, value))
  commit(rotateGradientFill(
    current.value as LinearGradientPaint,
    value - angle.value,
    props.geometry.width,
    props.geometry.height,
  ))
}
let dragging = false
let dragTarget: HTMLElement | undefined
let pointerId = 0
let stopPointerClick = false
function resetTrackPointer(): void {
  stopPointerClick = false
}
function trackClick(event: MouseEvent): void {
  if (stopPointerClick) {
    stopPointerClick = false
    event.preventDefault()
    event.stopPropagation()
    return
  }
  add(event)
}
onBeforeUnmount(cancel)
watch(() => props.fill, () => {
  cancel()
  selected.value = Math.min(selected.value, props.fill.stops.length - 1)
})
watch(() => props.disabled, (blocked) => {
  if (blocked) cancel()
})
function commit(fill: LinearFill): void {
  if (!props.disabled && JSON.stringify(fill) !== JSON.stringify(props.fill)) emit('commit', fill)
}
function updateStop(
  patch: Partial<Pick<GradientStop, 'position' | 'color'>>,
  preview = false,
): void {
  if (props.disabled) return
  const replacement = { position: patch.position ?? stop.value.position, color: patch.color ?? stop.value.color }
  const stops = current.value.stops
    .map((entry, i) => i === selected.value ? replacement : entry)
    .sort((a, b) => a.position - b.position)
  selected.value = stops.indexOf(replacement)
  const fill = { ...current.value, stops }
  if (preview) {
    draft.value = fill
    emit('preview', fill)
  } else commit(fill)
}
function position(event: PointerEvent | MouseEvent): number {
  const rect = track.value!.getBoundingClientRect()
  return Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * 100) / 100
}
function focusStop(): void {
  void nextTick(() => host.value?.querySelector<HTMLElement>(`[data-gradient-stop="${selected.value}"]`)?.focus({ preventScroll: true }))
}
function add(event: MouseEvent): void {
  if (
    props.disabled ||
    current.value.stops.length >= 8 ||
    event.target !== event.currentTarget
  ) return
  addStop(position(event))
}
function addStop(position: number): void {
  if (props.disabled || current.value.stops.length >= 8) return
  const entry = interpolateStop(current.value.stops, position)
  const stops = [...current.value.stops, entry].sort((a, b) => a.position - b.position)
  selected.value = stops.indexOf(entry)
  commit({ ...current.value, stops })
  focusStop()
}
function addBetweenStops(): void {
  const stops = current.value.stops
  let position = 0.5, gap = -1
  for (let i = 1; i < stops.length; i++) {
    const previous = stops[i - 1]!.position
    const width = stops[i]!.position - previous
    if (width > gap) {
      gap = width
      position = previous + width / 2
    }
  }
  addStop(position)
}
function remove(): void {
  if (props.disabled || current.value.stops.length <= 2) return
  const stops = current.value.stops.filter((_entry, i) => i !== selected.value)
  selected.value = Math.min(selected.value, stops.length - 1)
  commit({ ...current.value, stops })
  focusStop()
}
function begin(
  event: PointerEvent,
  index: number,
): void {
  if (props.disabled || event.button !== 0) return
  stopPointerClick = true
  selected.value = index
  dragging = true
  draft.value = props.fill
  dragTarget = event.currentTarget as HTMLElement
  pointerId = event.pointerId
  dragTarget.setPointerCapture?.(pointerId)
}
function move(event: PointerEvent): void {
  if (dragging && event.pointerId === pointerId) updateStop({ position: position(event) }, true)
}
function cancel(): void {
  if (dragging) emit('cancel')
  dragging = false
  draft.value = undefined
  if (dragTarget?.hasPointerCapture?.(pointerId)) dragTarget.releasePointerCapture(pointerId)
  dragTarget = undefined
}
function finish(event: PointerEvent): void {
  if (!dragging || event.pointerId !== pointerId) return
  const fill = current.value
  cancel()
  commit(fill)
  focusStop()
}
function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && dragging) {
    event.preventDefault()
    event.stopPropagation()
    cancel()
    focusStop()
  }
}
function markerKey(
  event: KeyboardEvent,
  index: number,
): void {
  if (props.disabled) return
  selected.value = index
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    event.stopPropagation()
    remove()
    return
  }
  const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : 0
  if (
    !direction &&
    event.key !== 'Home' &&
    event.key !== 'End'
  ) return
  event.preventDefault()
  event.stopPropagation()
  const position = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : Math.max(0, Math.min(1, stop.value.position + direction * (event.shiftKey ? 0.1 : 0.01)))
  updateStop({ position: Math.round(position * 100) / 100 })
  focusStop()
}
function changeColor(value: string): void {
  const color = parseHexColor(value)
  if (color) updateStop({ color: { ...color, alpha: stop.value.color.alpha } })
}
function reverse(): void {
  selected.value = current.value.stops.length - 1 - selected.value
  commit(reverseGradient(current.value))
}
</script>

<template>
  <div
    ref="host"
    class="cs-shape-gradient-editor"
    :class="{ 'is-compact': compact }"
    @keydown="keydown"
  >
    <div class="cs-gradient-track-wrap">
      <div
        ref="track"
        class="cs-gradient-track"
        :style="{ backgroundImage: gradientStrip(current) }"
        role="group"
        :aria-label="text('Gradient stops; click to add', 'Точки градиента; нажмите для добавления')"
        @pointerdown.capture="resetTrackPointer"
        @click.capture="trackClick"
      >
        <button
          v-for="(entry, index) in current.stops"
          :key="index"
          :data-gradient-stop="index"
          class="cs-gradient-stop"
          :class="{ 'is-selected': selected === index }"
          :style="{ left: `${entry.position * 100}%`, '--stop-color': colorCss(entry.color) }"
          type="button"
          role="slider"
          :aria-label="`${text('Gradient stop', 'Точка градиента')} ${index + 1}`"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(entry.position * 100)"
          :disabled="disabled"
          @focus="selected = index"
          @click.stop="selected = index"
          @pointerdown.stop="begin($event, index)"
          @pointermove.stop="move"
          @pointerup.stop="finish"
          @pointercancel="cancel"
          @lostpointercapture="cancel"
          @keydown="markerKey($event, index)"
        >
          <span />
        </button>
      </div>
    </div>
    <div class="cs-gradient-stop-details">
      <ShapeNumericControl
        :label="text('Stop position', 'Положение точки')"
        :compact-label="text('Position', 'Позиция')"
        :value="Math.round(stop.position * 100)"
        :min="0"
        :max="100"
        :step="1"
        unit="%"
        :disabled="disabled"
        :locale="locale"
        @commit="updateStop({ position: $event / 100 })"
      />
      <button
        type="button"
        class="cs-gradient-action"
        :disabled="disabled || current.stops.length >= 8"
        :aria-label="text('Add gradient stop', 'Добавить точку градиента')"
        :title="text('Add gradient stop', 'Добавить точку градиента')"
        @click="addBetweenStops"
      >
        <UiIcon name="plus" />
      </button>
      <button
        type="button"
        class="cs-gradient-action"
        :disabled="disabled || current.stops.length <= 2"
        :aria-label="text('Remove gradient stop', 'Удалить точку градиента')"
        :title="text('Remove gradient stop', 'Удалить точку градиента')"
        @click="remove"
      >
        <UiIcon name="trash" />
      </button>
    </div>
    <SimpleColorPicker
      :model-value="hex"
      v-bind="{ ariaLabel: text('Stop colour', 'Цвет точки') }"
      :recent-colors="recentColors"
      :locale="locale"
      :disabled="disabled"
      :eyedropper="false"
      :compact="compact"
      embedded
      @commit="changeColor"
      @dismiss="emit('dismiss')"
    />
    <ShapeNumericControl
      :label="text('Stop opacity', 'Непрозрачность точки')"
      :value="Math.round(stop.color.alpha * 100)"
      :min="0"
      :max="100"
      :step="1"
      unit="%"
      slider
      :disabled="disabled"
      :locale="locale"
      @commit="updateStop({ color: { ...stop.color, alpha: $event / 100 } })"
    />
    <div class="cs-gradient-direction">
      <ShapeNumericControl
        v-if="!hideDirection"
        :label="text('Angle', 'Угол')"
        :value="angle"
        :min="0"
        :max="359"
        :step="1"
        unit="°"
        :disabled="disabled"
        :locale="locale"
        @commit="setAngle"
      />
      <button
        type="button"
        class="cs-gradient-action"
        :disabled="disabled"
        :aria-label="text('Reverse gradient colours', 'Развернуть цвета градиента')"
        :title="text('Reverse gradient colours', 'Развернуть цвета градиента')"
        @click="reverse"
      >
        <UiIcon name="reverseGradient" />
      </button>
    </div>
  </div>
</template>
