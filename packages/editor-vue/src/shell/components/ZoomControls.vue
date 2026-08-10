<script setup lang="ts">
import { computed } from 'vue'
import { UiIcon } from '../icon'
const props = defineProps<{
  zoom: number
  t: (
    key:
      | 'zoom'
      | 'zoomOut'
      | 'zoomIn'
      | 'zoomValue'
      | 'zoomPercentage'
      | 'fitZoom',
  ) => string
}>()
const emit = defineEmits<{ zoom: [value: number]; fit: [] }>()
const zoomOptions = computed(() =>
  [...new Set([25, 50, 75, 100, 125, 150, 200, 400, props.zoom])].sort(
    (left, right) => left - right,
  ),
)
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
      class="cs-zoom-fit"
      :aria-label="t('fitZoom')"
      :title="t('fitZoom')"
      @click="emit('fit')"
    >
      Fit
    </button>
    <button
      type="button"
      class="cs-zoom-value"
      :title="t('zoomValue')"
      @click="emit('zoom', 100)"
    >
      {{ zoom }}%
    </button>
    <input
      class="cs-zoom-input"
      type="number"
      min="10"
      max="1600"
      step="1"
      :value="zoom"
      :aria-label="t('zoomPercentage')"
      @change="emit('zoom', Number(($event.target as HTMLInputElement).value))"
    />
    <select
      class="cs-zoom-presets"
      :value="zoom"
      :aria-label="t('zoom')"
      @change="emit('zoom', Number(($event.target as HTMLSelectElement).value))"
    >
      <option v-for="value in zoomOptions" :key="value" :value="value">
        {{ value }}%
      </option>
    </select>
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
