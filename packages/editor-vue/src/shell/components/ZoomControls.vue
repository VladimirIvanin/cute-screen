<script setup lang="ts">
import { NButton } from 'naive-ui'
import { UiIcon } from '../icon'
defineProps<{
  zoom: number
  t: (key: 'zoom' | 'zoomOut' | 'zoomIn' | 'zoomValue' | 'fitZoom') => string
}>()
const emit = defineEmits<{ zoom: [value: number]; fit: [] }>()
</script>

<template>
  <div
    class="cs-zoom-controls"
    role="group"
    :aria-label="t('zoom')"
    :data-zoom="zoom"
  >
    <NButton
      quaternary
      circle
      class="cs-icon-button"
      :aria-label="t('zoomOut')"
      :title="t('zoomOut')"
      @click="emit('zoom', zoom - 10)"
    >
      <UiIcon name="zoomOut" />
    </NButton>
    <NButton
      quaternary
      class="cs-zoom-fit"
      :aria-label="t('fitZoom')"
      :title="t('fitZoom')"
      @click="emit('fit')"
    >
      Fit
    </NButton>
    <NButton
      quaternary
      class="cs-zoom-value"
      :aria-label="t('zoomValue')"
      :title="t('zoomValue')"
      @click="emit('zoom', 100)"
    >
      1:1
    </NButton>
    <NButton
      quaternary
      circle
      class="cs-icon-button"
      :aria-label="t('zoomIn')"
      :title="t('zoomIn')"
      @click="emit('zoom', zoom + 10)"
    >
      <UiIcon name="zoomIn" />
    </NButton>
  </div>
</template>
