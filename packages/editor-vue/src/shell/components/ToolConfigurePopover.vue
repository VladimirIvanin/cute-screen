<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'

import {
  previewEnvironment,
  previewPlacement,
  type PreviewPlacement,
} from '../ui/preview-placement'

import { provideTransientSurface } from '../ui/transient-surface'
const surfaceOwner = provideTransientSurface()

const props = defineProps<{ anchor: HTMLElement; label: string }>()
const host = ref<HTMLElement>()
const layout = ref({ left: '0px', top: '0px', transform: 'none' })
let previous: PreviewPlacement | undefined
let observer: ResizeObserver | undefined
let frame: number | undefined

function scheduleUpdate(): void {
  if (frame !== undefined) return
  frame = requestAnimationFrame(() => {
    frame = undefined
    update()
  })
}

function update(): void {
  const panel = host.value
  if (!panel) return
  const { view, obstacles } = previewEnvironment(props.anchor, panel)
  panel.style.maxWidth = `${Math.max(1, view.width - 16)}px`
  panel.style.maxHeight = `${Math.max(1, view.height - 16)}px`
  const next = previewPlacement(
    props.anchor.getBoundingClientRect(),
    panel.getBoundingClientRect(),
    view,
    obstacles,
    previous,
  )
  previous = next
  if (layout.value.left !== `${next.left}px` || layout.value.top !== `${next.top}px`) {
    layout.value = { left: `${next.left}px`, top: `${next.top}px`, transform: 'none' }
  }
}

watch(() => props.anchor, update)
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(scheduleUpdate)
    if (host.value) observer.observe(host.value)
    observer.observe(props.anchor)
  }
  document.addEventListener('cs-preview-layout', scheduleUpdate)
  window.addEventListener('resize', update)
  window.addEventListener('scroll', update, true)
  update()
})
onBeforeUnmount(() => {
  if (frame !== undefined) cancelAnimationFrame(frame)
  observer?.disconnect()
  document.removeEventListener('cs-preview-layout', scheduleUpdate)
  window.removeEventListener('resize', update)
  window.removeEventListener('scroll', update, true)
})
</script>

<template>
  <div
    id="cs-tool-defaults"
    ref="host"
    role="dialog"
    :aria-label="label"
    :data-cs-surface="surfaceOwner"
    class="cs-tool-configure-popover-host"
    :style="layout"
  >
    <slot/>
  </div>
</template>
