<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import type {
  EditorDocumentV1,
  SrgbColor,
} from '@cute-screen/editor-renderer'
import type { ContextToolbarSchema } from '../types'
import ContextToolbar from './ContextToolbar.vue'

const props = defineProps<{
  schema?: ContextToolbarSchema | undefined
  document?: EditorDocumentV1 | undefined
  selectedIds: readonly string[]
  layersOpen: boolean
  zoom: number
  quickMode?: boolean
  locale: 'en' | 'ru'
  recentColors: readonly SrgbColor[]
}>()
const emit = defineEmits<{
  change: [id: string, value: string]
  action: [id: string]
  eyedropper: [id: string]
}>()
const host = ref<HTMLElement>()
const dragging = ref(false)
const positioned = ref(false)
let layout: { left: number; top: number; placement: string } | undefined
let observer: ResizeObserver | undefined
let resizeFrame: number | undefined
function toolbarBottomLimit(
  root: Element | null | undefined,
  view: DOMRect,
): number {
  const rail = root?.querySelector('.cs-toolrail')?.getBoundingClientRect()
  return rail && rail.top > view.top + view.height / 2
    ? Math.min(view.bottom, rail.top - 8)
    : view.bottom
}
function scheduleResize(): void {
  if (resizeFrame !== undefined) return
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = undefined
    update()
  })
}
function update(): void {
  if (!props.document || !props.selectedIds.length) {
    if (host.value) delete host.value.dataset.previewBounds
    positioned.value = false
    return
  }
  const root = host.value?.closest('.cs-workbench')
  const canvas = root?.querySelector('.cs-canvas-surface')
  const viewport = root?.querySelector('.cs-viewport')
  if (
    !(canvas instanceof HTMLElement) ||
    !(viewport instanceof HTMLElement) ||
    !host.value ||
    !props.document
  ) return
  const canvasRect = canvas.getBoundingClientRect()
  const view = viewport.getBoundingClientRect()
  const crop = props.quickMode ? null : props.document.crop
  const output = crop ?? props.document.canvas
  const scaleX = canvasRect.width / output.width
  const scaleY = canvasRect.height / output.height
  const points = props.document.layers
    .filter((layer) => props.selectedIds.includes(layer.id))
    .flatMap((layer) => {
      const b = layer.localBounds
      const t = layer.transform
      const radians = (t.rotation * Math.PI) / 180
      return [
        [b.x, b.y],
        [b.x + b.width, b.y],
        [b.x, b.y + b.height],
        [b.x + b.width, b.y + b.height],
      ].map(([x = 0, y = 0]) => ({
        x:
          canvasRect.left +
          (t.translateX + x * t.scaleX * Math.cos(radians) - y * t.scaleY * Math.sin(radians) - (crop?.x ?? 0)) *
          scaleX,
        y:
          canvasRect.top +
          (t.translateY + x * t.scaleX * Math.sin(radians) + y * t.scaleY * Math.cos(radians) - (crop?.y ?? 0)) *
          scaleY,
      }))
    })
  if (!points.length) {
    delete host.value.dataset.previewBounds
    positioned.value = false
    return
  }
  const left = Math.min(...points.map((point) => point.x))
  const right = Math.max(...points.map((point) => point.x))
  const top = Math.min(...points.map((point) => point.y))
  const bottom = Math.max(...points.map((point) => point.y))
  const previewBounds = [left, top, right - left, bottom - top].join(',')
  const boundsChanged = host.value.dataset.previewBounds !== previewBounds
  host.value.dataset.previewBounds = previewBounds
  if (boundsChanged) document.dispatchEvent(new Event('cs-preview-layout'))
  const width = host.value.offsetWidth
  const height = host.value.offsetHeight
  const above = top - height - 10
  const panel = root?.querySelector('.cs-layers-panel')?.getBoundingClientRect()
  const safeRight = panel && panel.height > 0 ? Math.min(view.right, panel.left - 8) : view.right
  const fitsBesidePanel = width + 16 <= safeRight - view.left
  const rightEdge = fitsBesidePanel ? safeRight : view.right
  const preferredTop = above >= view.top + 8 ? above : bottom + 10
  const panelBottom = !fitsBesidePanel && panel ? panel.bottom + 8 : view.top
  const safeBottom = toolbarBottomLimit(root, view)
  const nextLayout = {
    left: Math.max(view.left + 8, Math.min(rightEdge - width - 8, (left + right - width) / 2)),
    top: Math.max(view.top + 8, Math.min(safeBottom - height - 8, Math.max(preferredTop, panelBottom))),
    placement: above >= view.top + 8 ? 'above' : 'below',
  }
  positioned.value = true
  if (JSON.stringify(layout) === JSON.stringify(nextLayout)) return
  layout = nextLayout
  host.value.style.left = `${nextLayout.left}px`
  host.value.style.top = `${nextLayout.top}px`
  host.value.dataset.placement = nextLayout.placement
  document.dispatchEvent(new Event('cs-preview-layout'))
}
function pointerDown(event: PointerEvent): void {
  if (event.button === 0 && event.target instanceof HTMLCanvasElement) dragging.value = true
}
function pointerUp(): void {
  dragging.value = false
  void nextTick(update)
}
watch(
  () => [props.schema, props.document, props.selectedIds, props.zoom, props.layersOpen, props.quickMode],
  () => {
    void nextTick(update)
  },
  { deep: false },
)
watch(
  host,
  (element) => {
    layout = undefined
    positioned.value = false
    if (!element) return
    void nextTick(update)
    observer?.disconnect()
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleResize)
      observer.observe(element)
    }
  },
  { flush: 'post' },
)
onMounted(() => {
  window.addEventListener('resize', update)
  document.addEventListener('scroll', update, true)
  document.addEventListener('pointerdown', pointerDown)
  document.addEventListener('pointerup', pointerUp)
  document.addEventListener('pointercancel', pointerUp)
  if (typeof ResizeObserver !== 'undefined' && host.value) {
    observer = new ResizeObserver(scheduleResize)
    observer.observe(host.value)
  }
  update()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame)
  window.removeEventListener('resize', update)
  document.removeEventListener('scroll', update, true)
  document.removeEventListener('pointerdown', pointerDown)
  document.removeEventListener('pointerup', pointerUp)
  document.removeEventListener('pointercancel', pointerUp)
})
</script>

<template>
  <div
    ref="host"
    class="cs-selection-preview-host"
    :class="{
      'cs-selection-floating-toolbar': Boolean(schema),
      'cs-context-toolbar-surface': Boolean(schema),
      'cs-arrow-floating-toolbar-host': schema?.icon === 'arrow',
    }"
    :style="{
      position: 'fixed',
      width: 'max-content',
      visibility: dragging || !schema || !positioned ? 'hidden' : 'visible',
      zIndex: 30,
      maxWidth: 'calc(100vw - 24px)',
    }"
    @pointerdown.stop
  >
    <ContextToolbar
      :schema="schema"
      :label="schema?.title ?? ''"
      :picker-locale="locale"
      :recent-colors="recentColors"
      @change="(id, value) => emit('change', id, value)"
      @action="emit('action', $event)"
      @eyedropper="emit('eyedropper', $event)"
    />
  </div>
</template>
