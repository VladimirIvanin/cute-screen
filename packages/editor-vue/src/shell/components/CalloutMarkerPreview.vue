<script setup lang="ts">
import type { CalloutPayload } from '@cute-screen/editor-renderer'

defineProps<{
  marker: CalloutPayload['targetMarker']
  start?: boolean
}>()
</script>

<template>
  <svg
    viewBox="0 0 40 24"
    aria-hidden="true"
    focusable="false"
  >
    <g
      :transform="start ? 'translate(40 0) scale(-1 1)' : undefined"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path :d="marker === 'none' ? 'M4 12h30' : 'M4 12h24'"/>
      <circle
        v-if="marker === 'circle' || marker === 'ring'"
        cx="29"
        cy="12"
        r="4"
        :fill="marker === 'circle' ? 'currentColor' : 'var(--surface-raised)'"
      />
      <path v-if="marker === 'lineArrow'" d="m25 6 9 6-9 6"/>
      <path
        v-if="marker === 'solidArrow'"
        d="m24 6 10 6-10 6z"
        fill="currentColor"
      />
    </g>
  </svg>
</template>
