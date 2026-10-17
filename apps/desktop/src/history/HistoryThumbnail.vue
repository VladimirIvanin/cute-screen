<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  shallowRef,
} from 'vue'
import type { ImageResourceLease } from '@cute-screen/editor-vue'
import type { RecentCapture } from '../generated/desktop-ipc'
import type { HistoryPreviews } from './previews'
const props = defineProps<{ item: RecentCapture; previews: HistoryPreviews; unavailable: string }>()
const image = shallowRef<string>()
const failed = shallowRef(false)
let lease: ImageResourceLease<HTMLImageElement> | undefined
let disposed = false
const controller = new AbortController()
onMounted(async () => {
  try {
    const acquired = await props.previews.acquire(props.item, controller.signal)
    if (disposed) acquired.release()
    else {
      lease = acquired
      image.value = acquired.value.src
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) failed.value = true
  }
})
onBeforeUnmount(() => {
  disposed = true
  controller.abort()
  lease?.release()
})
</script>
<template>
  <img
    v-if="image"
    :src="image"
    alt=""
    draggable="false"
  >
  <span
    v-else
    class="cs-history-placeholder"
    :title="failed ? unavailable : undefined"
    :aria-label="failed ? unavailable : undefined"
  >{{ failed ? '—' : '…' }}</span>
</template>
