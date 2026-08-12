<script setup lang="ts">
import { NButton } from 'naive-ui'
import type { FrameSummary } from '../types'
defineProps<{
  frames: readonly FrameSummary[]
  activeFrameId?: string | undefined
  t: (key: 'selectedFrame' | 'seriesFrames') => string
}>()
const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <nav
    v-if="frames.length"
    class="cs-filmstrip"
    :aria-label="t('seriesFrames')"
  >
    <NButton
      v-for="frame in frames"
      :key="frame.id"
      quaternary
      class="cs-frame"
      :class="{ 'is-selected': frame.id === activeFrameId }"
      :aria-selected="frame.id === activeFrameId"
      :aria-label="
        frame.id === activeFrameId
          ? `${frame.label}: ${t('selectedFrame')}`
          : frame.label
      "
      @click="emit('select', frame.id)"
    >
      <span>{{ frame.label }}</span>
    </NButton>
  </nav>
</template>
