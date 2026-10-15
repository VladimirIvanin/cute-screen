<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'

const props = defineProps<{ anchor: HTMLElement }>()
const host = ref<HTMLElement>()
const layout = ref({ left: '0px', top: '0px' })
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
  const bounds = panel.getBoundingClientRect()
  const anchor = props.anchor.getBoundingClientRect()
  const half = bounds.width / 2
  const left = Math.max(half + 8, Math.min(window.innerWidth - half - 8, anchor.left + anchor.width / 2))
  const top = Math.min(window.innerHeight - 8, Math.max(bounds.height + 16, anchor.top))
  if (layout.value.left !== `${left}px` || layout.value.top !== `${top}px`) {
    layout.value = { left: `${left}px`, top: `${top}px` }
  }
}

watch(() => props.anchor, update)
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') {
    update()
    return
  }
  observer = new ResizeObserver(scheduleUpdate)
  if (host.value) observer.observe(host.value)
  observer.observe(props.anchor)
  window.addEventListener('resize', update)
  window.addEventListener('scroll', update, true)
  update()
})
onBeforeUnmount(() => {
  if (frame !== undefined) cancelAnimationFrame(frame)
  observer?.disconnect()
  window.removeEventListener('resize', update)
  window.removeEventListener('scroll', update, true)
})
</script>

<template>
  <div
    ref="host"
    class="cs-tool-configure-popover-host"
    :style="layout"
  >
    <slot/>
  </div>
</template>
