<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from 'vue'
import {
  rasterizeFreeform,
  type CardBackground,
  type FreeformPoint,
} from '@cute-screen/editor-renderer'
import ShapeGradientEditor from '../components/ShapeGradientEditor.vue'
import type { LinearFill } from '../ui/shape-gradient'
import CardColor from './CardColor.vue'
import CardGradientPresets from './CardGradientPresets.vue'
import CardNumber from './CardNumber.vue'
const props = defineProps<{ value: CardBackground; locale: 'ru' | 'en'; disabled: boolean; editing: boolean }>()
const emit = defineEmits<{ change: [value: CardBackground]; preview: [value: CardBackground]; cancel: []; edit: [] }>()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
const selected = ref(0), canvas = ref<HTMLCanvasElement>()
const draft = shallowRef<CardBackground>()
const current = computed(() => draft.value ?? props.value)
const point = computed(() => current.value.freeform.points[selected.value] ?? current.value.freeform.points[0]!)
const linearFill = computed(() => ({ kind: 'linearGradient', opacity: 1,
  ...(props.value.kind === 'radial' ? { ...props.value.linear, stops: props.value.radial.stops } : props.value.linear) }) as LinearFill)
function changeStops(
  fill: LinearFill,
  preview = false,
): void {
  const value = props.value.kind === 'radial' ? { ...props.value, radial: { ...props.value.radial, stops: fill.stops } }
    : { ...props.value, linear: { stops: fill.stops, start: fill.start, end: fill.end } }
  if (preview) emit('preview', value)
  else emit('change', value)
}
function patchPoint(
  patch: Partial<FreeformPoint>,
  preview = false,
): void {
  const points = current.value.freeform.points.map((p, i) => i === selected.value ? { ...p, ...patch } : p)
  const value = { ...current.value, freeform: { ...current.value.freeform, points } }
  if (preview) {
    draft.value = value
    emit('preview', value)
  } else {
    draft.value = undefined
    emit('change', value)
  }
}
let target: HTMLElement | undefined, pointerId = -1
function position(event: PointerEvent | MouseEvent) {
  const rect = canvas.value!.getBoundingClientRect()
  return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }
}
function begin(
  event: PointerEvent,
  index: number,
): void {
  if (props.disabled) return
  selected.value = index
  pointerId = event.pointerId
  target = event.currentTarget as HTMLElement
  target.setPointerCapture(pointerId)
}
function move(event: PointerEvent): void {
  if (pointerId === event.pointerId) patchPoint(position(event), true)
}
function cancel(): void {
  if (target?.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
  pointerId = -1
  target = undefined
  draft.value = undefined
  emit('cancel')
}
function finish(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return
  const value = current.value
  if (target?.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
  pointerId = -1
  target = undefined
  draft.value = undefined
  emit('change', value)
}
function add(position = { x: 0.5, y: 0.5 }): void {
  const points = current.value.freeform.points
  if (props.disabled || points.length >= 16) return
  selected.value = points.length
  emit('change', { ...current.value, freeform: { ...current.value.freeform,
    points: [...points, { ...point.value, ...position, id: crypto.randomUUID() }] } })
}
function remove(): void {
  if (props.disabled || current.value.freeform.points.length <= 2) return
  const points = current.value.freeform.points.filter((_, i) => i !== selected.value)
  selected.value = Math.min(selected.value, points.length - 1)
  emit('change', { ...current.value, freeform: { ...current.value.freeform, points } })
}
function key(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement || props.disabled) return
  const delta = event.shiftKey ? 0.1 : 0.01
  const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'x' : 'y'
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()
    const sign = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    patchPoint({ [axis]: Math.max(0, Math.min(1, point.value[axis] + sign * delta)) })
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    event.stopPropagation()
    remove()
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancel()
  }
}
function draw(): void {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx || !canvas.value) return
  const image = ctx.createImageData(280, 160)
  image.data.set(rasterizeFreeform(current.value.freeform.points, 280, 160))
  ctx.putImageData(image, 0, 0)
}
watch([current, canvas], draw, { flush: 'post' })
watch(() => props.value, () => {
  draft.value = undefined
})
onBeforeUnmount(() => {
  if (pointerId !== -1) cancel()
})
</script>
<template>
  <fieldset :disabled="disabled">
    <CardGradientPresets
      :value="value"
      :locale="locale"
      @change="emit('change', $event)"
    />
    <ShapeGradientEditor
      v-if="value.kind === 'linear' || value.kind === 'radial'"
      compact
      :fill="linearFill"
      :hide-direction="value.kind === 'radial'"
      :disabled="disabled"
      :locale="locale"
      :recent-colors="[]"
      @commit="changeStops($event)"
      @preview="changeStops($event, true)"
      @cancel="cancel"
    />
    <template v-if="value.kind === 'radial'">
      <CardNumber
        v-for="axis in ['x', 'y'] as const"
        :key="axis"
        :label="`${text('Центр', 'Center')} ${axis.toUpperCase()} %`"
        :value="Math.round(value.radial.center[axis] * 100)"
        :min="0"
        :max="100"
        @change="emit('change', { ...value, radial: { ...value.radial, center: { ...value.radial.center, [axis]: $event / 100 } } })"
        @preview="emit('preview', { ...value, radial: { ...value.radial, center: { ...value.radial.center, [axis]: $event / 100 } } })"
        @cancel="cancel"
      />
      <CardNumber
        :label="text('Радиус %', 'Radius %')"
        :value="value.radial.radius * 100"
        :min="1"
        :max="400"
        @change="emit('change', { ...value, radial: { ...value.radial, radius: $event / 100 } })"
        @preview="emit('preview', { ...value, radial: { ...value.radial, radius: $event / 100 } })"
        @cancel="cancel"
      />
    </template>
    <template v-if="value.kind === 'freeform'">
      <div class="cs-card-mesh" @keydown="key">
        <canvas
          ref="canvas"
          width="280"
          height="160"
          :aria-label="text('Свободный градиент', 'Freeform gradient')"
          @dblclick="add(position($event))"
        />
        <button
          v-for="(p, index) in current.freeform.points"
          :key="p.id"
          type="button"
          class="cs-card-gradient-handle"
          :aria-label="`${text('Цветовая точка', 'Color point')} ${index + 1}`"
          :aria-pressed="selected === index"
          :style="{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }"
          @focus="selected = index"
          @pointerdown.stop="begin($event, index)"
          @pointermove="move"
          @pointerup="finish"
          @pointercancel="cancel"
        >
          <span>{{ index + 1 }}</span>
        </button>
      </div>
      <div class="cs-card-buttons">
        <button
          type="button"
          :disabled="current.freeform.points.length >= 16"
          @click="add()"
        >
          {{ text('Добавить точку', 'Add point') }}
        </button><button
          type="button"
          :disabled="current.freeform.points.length >= 16"
          @click="add({ x: Math.min(1, point.x + 0.05), y: Math.min(1, point.y + 0.05) })"
        >
          {{ text('Дублировать', 'Duplicate') }}
        </button><button
          type="button"
          :disabled="current.freeform.points.length <= 2"
          @click="remove"
        >
          {{ text('Удалить точку', 'Remove point') }}
        </button>
      </div>
      <CardColor
        :label="text('Цвет точки', 'Point color')"
        :value="point.color"
        :locale="locale"
        :disabled="disabled"
        @change="patchPoint({ color: $event })"
        @preview="patchPoint({ color: $event }, true)"
        @cancel="cancel"
      />
      <CardNumber
        v-for="axis in ['x', 'y'] as const"
        :key="axis"
        :label="`${axis.toUpperCase()} %`"
        :value="Math.round(point[axis] * 100)"
        :min="0"
        :max="100"
        @change="patchPoint({ [axis]: $event / 100 })"
        @preview="patchPoint({ [axis]: $event / 100 }, true)"
        @cancel="cancel"
      />
      <CardNumber
        :label="text('Влияние %', 'Spread %')"
        :value="Math.round(point.radius * 100)"
        :min="1"
        :max="400"
        @change="patchPoint({ radius: $event / 100 })"
        @preview="patchPoint({ radius: $event / 100 }, true)"
        @cancel="cancel"
      />
    </template>
    <button
      type="button"
      :aria-pressed="editing"
      @click="emit('edit')"
    >
      {{ editing ? text('Готово', 'Done') : text('Редактировать на холсте', 'Edit on canvas') }}
    </button>
  </fieldset>
</template>
