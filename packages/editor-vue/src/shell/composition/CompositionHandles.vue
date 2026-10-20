<script setup lang="ts">
import {
  computed,
  inject,
  ref,
  shallowRef,
  onBeforeUnmount,
} from 'vue'
import {
  brandingNodes,
  resolveCompositionLayout,
  type CompositionSettings,
  type CardBackground,
  type CardPoint,
} from '@cute-screen/editor-renderer'
import type { EditorDocumentV1 } from '@cute-screen/editor-renderer'
import { compositionEditingKey } from './editing'
const props = defineProps<{ document: EditorDocumentV1; locale: 'ru' | 'en' }>()
const state = inject(compositionEditingKey, undefined)
const host = ref<HTMLElement>(), titleInput = ref<HTMLInputElement>()
const title = ref<string>()
const titleField = ref<'title' | 'url'>('title')
const baseline = shallowRef<CompositionSettings>()
const settings = computed(() => state?.preview.value ?? state?.settings.value)
const layout = computed(() => resolveCompositionLayout({ ...props.document,
  presentation: { ...props.document.presentation, ...(settings.value ? { composition: settings.value } : {}) } }))
const background = computed(() => {
  const s = settings.value
  return !s || !state ? undefined : state.gradientTarget.value === 'background' ? s.background : s[state.gradientTarget.value].fill
})
const region = computed(() => !state || state.gradientTarget.value === 'background'
  ? { x: 0, y: 0, width: layout.value.width, height: layout.value.height } : layout.value[state.gradientTarget.value])
const handles = computed(() => {
  const bg = background.value
  if (bg?.kind === 'linear') return [bg.linear.start, bg.linear.end]
  if (bg?.kind === 'radial') return [bg.radial.center, { x: bg.radial.center.x + bg.radial.radius / 2, y: bg.radial.center.y }]
  return bg?.kind === 'freeform' ? bg.freeform.points : []
})
function style(point: CardPoint): Record<string, string> {
  return { left: `${(region.value.x + point.x * region.value.width) / layout.value.width * 100}%`,
    top: `${(region.value.y + point.y * region.value.height) / layout.value.height * 100}%` }
}
let pointer = -1, index = -1, brand = false, start = { x: 0, y: 0 }
function begin(
  event: PointerEvent,
  handle: number,
  isBrand = false,
): void {
  if (!state || state.disabled.value) return
  event.preventDefault()
  event.stopPropagation()
  baseline.value = state.settings.value
  pointer = event.pointerId
  index = handle
  brand = isBrand
  start = location(event)
  ;
  (event.currentTarget as HTMLElement).setPointerCapture(pointer)
}
function location(event: PointerEvent): CardPoint {
  const rect = host.value!.getBoundingClientRect()
  return { x: (event.clientX - rect.left) / rect.width * layout.value.width,
    y: (event.clientY - rect.top) / rect.height * layout.value.height }
}
function updateBackground(
  s: CompositionSettings,
  bg: CardBackground,
): CompositionSettings {
  const target = state!.gradientTarget.value
  return target === 'background' ? { ...s, background: bg } : { ...s, [target]: { ...s[target], fill: bg } }
}
function movedGradient(point: CardPoint): CompositionSettings {
  const s = baseline.value!, target = state!.gradientTarget.value
  const bg = target === 'background' ? s.background : s[target].fill
  const r = region.value
  const p = { x: Math.max(0,
    Math.min(1,
      (point.x - r.x) / r.width)),
  y: Math.max(0,
    Math.min(1,
      (point.y - r.y) / r.height)) }
  if (bg.kind === 'linear' && Math.hypot(p.x - bg.linear[index === 0 ? 'end' : 'start'].x, p.y - bg.linear[index === 0 ? 'end' : 'start'].y) < 0.00001) return s
  if (bg.kind === 'linear') return updateBackground(s, { ...bg, linear: { ...bg.linear, [index === 0 ? 'start' : 'end']: p } })
  if (bg.kind === 'radial') return updateBackground(s, { ...bg, radial: index === 0 ? { ...bg.radial, center: p }
    : { ...bg.radial,
        radius: Math.max(0.01,
          Math.min(4,
            Math.hypot(p.x - bg.radial.center.x,
              p.y - bg.radial.center.y) * 2)) } })
  return updateBackground(s, { ...bg, freeform: { ...bg.freeform,
    points: bg.freeform.points.map((v, i) => i === index ? { ...v, ...p } : v) } })
}
function move(event: PointerEvent): void {
  if (
    pointer !== event.pointerId ||
    !baseline.value ||
    !state
  ) return
  const p = location(event), s = baseline.value
  const value = brand ? { ...s, branding: s.branding.map((b) => b.id === state.selectedBrand.value ? { ...b,
    offset: { x: b.offset.x + p.x - start.x, y: b.offset.y + p.y - start.y } } : b) } : movedGradient(p)
  state.showPreview(value)
}
function cancel(): void {
  pointer = -1
  baseline.value = undefined
  state?.cancel()
}
function finish(event: PointerEvent): void {
  if (event.pointerId !== pointer || !state) return
  const value = state.preview.value
  pointer = -1
  baseline.value = undefined
  if (value) state.commit(value)
}
const brandStyle = computed(() => {
  const block = settings.value?.branding.find((b) => b.id === state?.selectedBrand.value)
  const node = block && brandingNodes(block, layout.value).find((n) => 'x' in n && 'width' in n)
  if (
    !node ||
    !('x' in node) ||
    !('width' in node)
  ) return undefined
  return { left: `${node.x / layout.value.width * 100}%`, top: `${node.y / layout.value.height * 100}%`,
    width: `${node.width / layout.value.width * 100}%`, height: `${node.height / layout.value.height * 100}%` }
})
const titleStyle = computed(() => ({ left: `${layout.value.frame.x / layout.value.width * 100}%`,
  top: `${layout.value.frame.y / layout.value.height * 100}%`, width: `${layout.value.frame.width / layout.value.width * 100}%`,
  height: `${(layout.value.screen.y - layout.value.frame.y) / layout.value.height * 100}%` }))
function editTitle(field: 'title' | 'url' = 'title'): void {
  titleField.value = field
  title.value = settings.value?.frame[field]
  queueMicrotask(() => titleInput.value?.focus())
}
function commitTitle(): void {
  if (!settings.value || title.value === undefined) return
  state?.commit({ ...settings.value, frame: { ...settings.value.frame,
    [titleField.value]: title.value } })
  title.value = undefined
}
function handleKey(
  event: KeyboardEvent,
  handle: number,
): void {
  if (
    !state ||
    !settings.value ||
    state.disabled.value
  ) return
  const bg = background.value
  if (
    (event.key === 'Delete' ||
      event.key === 'Backspace') &&
      bg?.kind === 'freeform'
  ) {
    event.preventDefault()
    if (bg.freeform.points.length <= 2) return
    state.commit(updateBackground(settings.value, { ...bg, freeform: { ...bg.freeform,
      points: bg.freeform.points.filter((_, n) => n !== handle) } }))
    return
  }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  baseline.value = settings.value
  index = handle
  const p = handles.value[handle]!, r = region.value
  const delta = event.shiftKey ? 0.1 : 0.01
  const x = p.x + (event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0)
  const y = p.y + (event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0)
  state.commit(movedGradient({ x: r.x + x * r.width, y: r.y + y * r.height }))
  baseline.value = undefined
}
onBeforeUnmount(cancel)
</script>
<template>
  <div
    v-if="state && settings"
    ref="host"
    class="cs-composition-handles"
    :class="{ 'is-editing': state.editing.value }"
    @keydown.esc.prevent.stop="cancel(); state.editing.value = false"
  >
    <template v-if="state.editing.value">
      <button
        v-for="(p, n) in handles"
        :key="n"
        type="button"
        class="cs-card-gradient-handle"
        :aria-label="`${locale === 'ru' ? 'Точка градиента' : 'Gradient point'} ${n + 1}`"
        :style="style(p)"
        @keydown="handleKey($event, n)"
        @pointerdown="begin($event, n)"
        @pointermove="move"
        @pointerup="finish"
        @pointercancel="cancel"
      >
        <span>{{ n + 1 }}</span>
      </button>
    </template>
    <button
      v-else-if="brandStyle"
      type="button"
      class="cs-card-brand-handle"
      :aria-label="locale === 'ru' ? 'Переместить подпись' : 'Move signature'"
      :style="brandStyle"
      @keydown.delete.prevent.stop
      @keydown.backspace.prevent.stop
      @pointerdown="begin($event, 0, true)"
      @pointermove="move"
      @pointerup="finish"
      @pointercancel="cancel"
    />
    <button
      v-if="!state.editing.value && ['window', 'browser'].includes(settings.frame.kind)"
      type="button"
      class="cs-card-title-hit"
      :style="titleStyle"
      :aria-label="locale === 'ru' ? 'Редактировать заголовок рамки' : 'Edit frame title'"
      @dblclick.stop="editTitle('title')"
    />
    <input
      v-if="title !== undefined"
      ref="titleInput"
      v-model="title"
      class="cs-card-title-editor"
      :style="titleStyle"
      :aria-label="locale === 'ru' ? 'Заголовок рамки' : 'Frame title'"
      @keydown.enter.prevent.stop="commitTitle"
      @keydown.esc.prevent.stop="title = undefined"
      @blur="commitTitle"
    />
  </div>
</template>
