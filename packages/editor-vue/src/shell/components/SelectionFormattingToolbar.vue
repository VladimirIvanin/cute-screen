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
import { UiIcon } from '../icon'
import {
  previewViewport,
  type PreviewRect,
} from '../ui/preview-placement'
import {
  selectionPreviewBounds,
  selectionToolbarPosition,
} from '../ui/selection-toolbar-geometry'
import ContextToolbar from './ContextToolbar.vue'

import { provideTransientSurface } from '../ui/transient-surface'
const surfaceOwner = provideTransientSurface()

const props = defineProps<{
  moveEnabled?: boolean
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
  moveStart: [event: PointerEvent]
  change: [id: string, value: string]
  action: [id: string]
  eyedropper: [id: string]
}>()
const host = ref<HTMLElement>()
const smallSelection = ref(false)
const dragging = ref(false)
const positioned = ref(false)
let layout: { left: number; top: number; placement: string } | undefined
let observer: ResizeObserver | undefined
let resizeFrame: number | undefined
function toolbarBottomLimit(
  root: Element | null | undefined,
  view: PreviewRect,
): number {
  let bottom = view.top + view.height
  root?.querySelectorAll<HTMLElement>('.cs-toolrail, .cs-context-toolbar, .cs-filmstrip, .cs-zoom-controls, .cs-quick-history, .cs-quick-settings-button').forEach((element) => {
    if (host.value?.contains(element)) return
    const rect = element.getBoundingClientRect()
    if (
      rect.height > 0 &&
      rect.top > view.top + view.height / 2 &&
      getComputedStyle(element).visibility !== 'hidden' &&
      !element.closest('[inert]')
    ) bottom = Math.min(bottom, rect.top - 8)
  })
  return bottom
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
    smallSelection.value = false
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
  const view = previewViewport(host.value)
  const bounds = selectionPreviewBounds(props.document, props.selectedIds, canvasRect, Boolean(props.quickMode))
  if (!bounds) {
    smallSelection.value = false
    delete host.value.dataset.previewBounds
    positioned.value = false
    return
  }
  smallSelection.value = bounds.small
  const previewBounds = [bounds.left, bounds.top, bounds.width, bounds.height].join(',')
  const boundsChanged = host.value.dataset.previewBounds !== previewBounds
  host.value.dataset.previewBounds = previewBounds
  if (boundsChanged) document.dispatchEvent(new Event('cs-preview-layout'))
  const panel = root?.querySelector('.cs-layers-panel')?.getBoundingClientRect()
  const nextLayout = selectionToolbarPosition(
    bounds, { width: host.value.offsetWidth, height: host.value.offsetHeight }, view,
    toolbarBottomLimit(root, view), panel,
    Boolean(smallSelection.value && props.moveEnabled || props.schema?.icon === 'image'),
  )
  positioned.value = true
  if (JSON.stringify(layout) === JSON.stringify(nextLayout)) return
  layout = nextLayout
  host.value.style.left = `${nextLayout.left}px`
  host.value.style.top = `${nextLayout.top}px`
  host.value.dataset.placement = nextLayout.placement
  document.dispatchEvent(new Event('cs-preview-layout'))
}
function startMove(event: PointerEvent): void {
  if (event.button !== 0) return
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus({ preventScroll: true })
  emit('moveStart', event)
}
function pointerDown(event: PointerEvent): void {
  if (event.button === 0 && event.target instanceof HTMLCanvasElement) dragging.value = true
}
function pointerUp(): void {
  dragging.value = false
  void nextTick(update)
}
function observeLayout(element: HTMLElement): void {
  observer?.disconnect()
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(scheduleResize)
  observer.observe(element)
  const root = element.closest('.cs-editor-shell') ?? element.closest('.cs-workbench')
  root?.querySelectorAll('.cs-topbar, .cs-viewport, .cs-bottom-chrome, .cs-quick-toolrail-group, .cs-quick-defaults').forEach((chrome) => {
    observer?.observe(chrome)
  })
}
watch(
  () => [
    props.schema, props.document, props.selectedIds, props.zoom,
    props.layersOpen, props.quickMode, props.moveEnabled,
  ],
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
    observeLayout(element)
  },
  { flush: 'post' },
)
onMounted(() => {
  window.addEventListener('resize', update)
  document.addEventListener('scroll', update, true)
  document.addEventListener('pointerdown', pointerDown)
  document.addEventListener('pointerup', pointerUp)
  document.addEventListener('pointercancel', pointerUp)
  document.addEventListener('cs-preview-layout', scheduleResize)
  if (host.value) observeLayout(host.value)
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
  document.removeEventListener('cs-preview-layout', scheduleResize)
})
</script>

<template>
  <div
    ref="host"
    :data-cs-surface="surfaceOwner"
    class="cs-selection-preview-host"
    :class="{
      'cs-selection-floating-toolbar': selectedIds.length > 0 && (Boolean(schema) || smallSelection && moveEnabled),
      'cs-context-toolbar-surface': selectedIds.length > 0 && (Boolean(schema) || smallSelection && moveEnabled),
      'cs-arrow-floating-toolbar-host': schema?.icon === 'arrow',
    }"
    :style="{
      position: 'fixed',
      width: 'max-content',
      visibility: dragging || (!schema && !(smallSelection && moveEnabled)) || !positioned ? 'hidden' : 'visible',
      zIndex: 30,
      maxWidth: 'calc(100vw - 24px)',
    }"
    @pointerdown.stop
  >
    <button
      v-if="smallSelection && moveEnabled"
      type="button"
      class="cs-selection-move-grip"
      :aria-label="locale === 'ru' ? 'Переместить' : 'Move selection'"
      :title="locale === 'ru' ? 'Перетащите или используйте клавиши со стрелками' : 'Drag or use arrow keys'"
      @pointerdown="startMove"
    >
      <UiIcon name="move" />
    </button>
    <ContextToolbar
      v-if="schema"
      :key="selectedIds.join(',')"
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
