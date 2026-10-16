<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  mode: 'pixelate' | 'blur' | 'solid'
  amount?: number
  color?: string
}>(), { amount: 12, color: 'currentColor' })
// Illustrative data only: previews never read or expose the user's screenshot.
const cells = computed(() => {
  const size = props.amount <= 6 ? 3 : props.amount <= 12 ? 6 : 12
  return Array.from({ length: Math.ceil(56 / size) * Math.ceil(20 / size) }, (_, index) => {
    const columns = Math.ceil(56 / size)
    const x = 4 + index % columns * size, y = 4 + Math.floor(index / columns) * size
    let coverage = 0
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const sampleX = x + column + 0.5, sampleY = y + row + 0.5
        const avatar = (sampleX - 13) ** 2 + (sampleY - 14) ** 2 <= 36
        const line = sampleX >= 25 && (
          (sampleX <= 53 && Math.abs(sampleY - 9) <= 1.5) ||
          (sampleX <= 47 && Math.abs(sampleY - 15) <= 1.5) ||
          (sampleX <= 40 && Math.abs(sampleY - 21) <= 1.5)
        )
        coverage += avatar ? 0.65 : line ? 1 : 0
      }
    }
    return { x, y, size, opacity: coverage / (size * size) }
  })
})
</script>

<template>
  <svg
    class="cs-censor-sample"
    viewBox="0 0 64 28"
    aria-hidden="true"
  >
    <rect
      class="cs-censor-sample-background"
      width="64"
      height="28"
      rx="4"
    />
    <svg
      v-if="mode === 'pixelate'"
      x="4"
      y="4"
      width="56"
      height="20"
      viewBox="4 4 56 20"
    >
      <rect
        v-for="(cell, index) in cells"
        :key="index"
        :x="cell.x"
        :y="cell.y"
        :width="cell.size"
        :height="cell.size"
        fill="currentColor"
        :opacity="cell.opacity"
      />
    </svg>
    <g v-else-if="mode === 'blur'" :style="{ filter: `blur(${Math.min(3, amount / 10)}px)` }">
      <circle
        cx="13"
        cy="14"
        r="6"
        fill="currentColor"
        opacity="0.65"
      />
      <path
        d="M25 9h28M25 15h22M25 21h15"
        stroke="currentColor"
        stroke-width="3"
      />
    </g>
    <rect
      v-else
      x="4"
      y="4"
      width="56"
      height="20"
      rx="1"
      :fill="color"
    />
  </svg>
</template>
