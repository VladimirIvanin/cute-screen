<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NInputNumber } from 'naive-ui'
import { UiIcon } from '../icon'
import UiSelect from '../ui/UiSelect.vue'
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
      :title="t('zoomValue')"
      @click="emit('zoom', 100)"
    >
      {{ zoom }}%
    </NButton>
    <NInputNumber
      class="cs-zoom-input"
      size="small"
      :min="10"
      :max="1600"
      :step="1"
      :value="zoom"
      :aria-label="t('zoomPercentage')"
      :show-button="false"
      @update:value="typeof $event === 'number' && emit('zoom', $event)"
    />
    <UiSelect
      class="cs-zoom-presets"
      :model-value="zoom"
      v-bind="{ ariaLabel: t('zoom') }"
      :options="zoomOptions.map((value) => ({ value, label: `${value}%` }))"
      @update:model-value="typeof $event === 'number' && emit('zoom', $event)"
    />
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
