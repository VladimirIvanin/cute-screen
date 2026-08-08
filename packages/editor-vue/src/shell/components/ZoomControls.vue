<script setup lang="ts">
import { UiIcon } from '../icon'
defineProps<{
  zoom: number
  t: (key: 'zoom' | 'zoomOut' | 'zoomIn' | 'zoomValue') => string
}>()
const emit = defineEmits<{ zoom: [value: number] }>()
</script>

<template>
  <div class="cs-zoom-controls" role="group" :aria-label="t('zoom')">
    <button
      type="button"
      class="cs-icon-button"
      :aria-label="t('zoomOut')"
      :title="t('zoomOut')"
      @click="emit('zoom', zoom - 10)"
    >
      <UiIcon name="zoomOut" />
    </button>
    <button
      type="button"
      class="cs-zoom-value"
      :title="t('zoomValue')"
      @click="emit('zoom', 100)"
    >
      {{ zoom }}%
    </button>
    <button
      type="button"
      class="cs-icon-button"
      :aria-label="t('zoomIn')"
      :title="t('zoomIn')"
      @click="emit('zoom', zoom + 10)"
    >
      <UiIcon name="zoomIn" />
    </button>
  </div>
</template>
