<script setup lang="ts">
import { computed } from 'vue'
import type { HighlighterEffect } from '@cute-screen/editor-renderer'

const props = withDefaults(defineProps<{
  effect: HighlighterEffect
  color: string
  intensity: number
  neutral?: boolean
  compact?: boolean
}>(), { neutral: false, compact: false })
const blend = computed(() => ({ highlight: 'multiply', illuminate: 'screen', veil: 'normal' } as const)[props.effect])
</script>

<template>
  <span
    class="cs-highlighter-sample"
    :class="[`is-${effect}`, { 'is-neutral': neutral, 'is-compact': compact }]"
    aria-hidden="true"
  >
    <b>{{ neutral ? '—' : 'Aa' }}</b>
    <span
      v-if="!neutral"
      class="cs-highlighter-sample-stroke"
      :style="{ backgroundColor: color, mixBlendMode: blend, opacity: intensity / 100 }"
    />
  </span>
</template>
