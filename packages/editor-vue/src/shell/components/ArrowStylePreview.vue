<script setup lang="ts">
defineProps<{
  kind: 'cap' | 'path'
  value: string
  start?: boolean
}>()
</script>

<template>
  <svg
    viewBox="0 0 32 24"
    aria-hidden="true"
    focusable="false"
  >
    <g
      :transform="start ? 'translate(32 0) scale(-1 1)' : undefined"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <template v-if="kind === 'cap'">
        <path :d="value === 'none' ? 'M4 12h24' : 'M4 12h17'"/>
        <path v-if="value === 'lineArrow'" d="m20 7 7 5-7 5M21 12h6"/>
        <path
          v-else-if="value === 'solidArrow'"
          d="m19 6 9 6-9 6z"
          fill="currentColor"
        />
        <path
          v-else-if="value === 'triangle'"
          d="m19 6 9 6-9 6z"
          fill="var(--surface-raised)"
        />
        <circle
          v-else-if="value === 'circle'"
          cx="24"
          cy="12"
          r="4"
          fill="var(--surface-raised)"
        />
        <path
          v-else-if="value === 'diamond'"
          d="m24 6 5 6-5 6-5-6z"
          fill="var(--surface-raised)"
        />
      </template>
      <path v-else-if="value === 'straight'" d="M5 18 27 6"/>
      <path v-else-if="value === 'elbow'" d="M5 18h11V6h11"/>
      <path v-else d="M5 18C16 18 16 6 27 6"/>
    </g>
  </svg>
</template>
