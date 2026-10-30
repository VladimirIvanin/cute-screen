<script setup lang="ts">
import { computed } from 'vue'
import {
  createFramePreview,
  shapePathSvg,
  type CardFrame,
  type RenderPaint,
} from '@cute-screen/editor-renderer'
const props = defineProps<{ frame: CardFrame }>()
const preview = computed(() => createFramePreview(props.frame))
function color(paint: RenderPaint | undefined): string {
  if (!paint || 'kind' in paint) return 'none'
  return `rgba(${paint.red * 255},${paint.green * 255},${paint.blue * 255},${paint.alpha})`
}
</script>
<template>
  <svg
    :viewBox="`0 0 ${preview.width} ${preview.height}`"
    aria-hidden="true"
    focusable="false"
    class="cs-card-model-preview"
  >
    <template v-for="node in preview.nodes" :key="node.id">
      <path
        v-if="node.kind === 'vector'"
        :d="shapePathSvg(node.outline)"
        :fill="color(node.fill)"
        :stroke="color(node.stroke)"
        :stroke-width="node.strokeWidth"
        :stroke-linecap="node.lineCap"
        :stroke-linejoin="node.lineJoin"
      />
      <rect
        v-else-if="node.kind === 'rect'"
        :x="node.x"
        :y="node.y"
        :width="node.width"
        :height="node.height"
        :rx="node.cornerRadius"
        :fill="color(node.fill)"
        :stroke="color(node.stroke)"
        :stroke-width="node.strokeWidth"
      />
      <ellipse
        v-else-if="node.kind === 'ellipse'"
        :cx="node.centerX"
        :cy="node.centerY"
        :rx="node.radiusX"
        :ry="node.radiusY"
        :fill="color(node.fill)"
      />
      <line
        v-else-if="node.kind === 'line'"
        :x1="node.x1"
        :y1="node.y1"
        :x2="node.x2"
        :y2="node.y2"
        :stroke="color(node.stroke)"
        :stroke-width="node.strokeWidth"
      />
      <polyline
        v-else-if="node.kind === 'path'"
        :points="node.points.map((point) => `${point.x},${point.y}`).join(' ')"
        fill="none"
        :stroke="color(node.stroke)"
        :stroke-width="node.strokeWidth"
        :stroke-linecap="node.lineCap"
        :stroke-linejoin="node.lineJoin"
      />
      <text
        v-else-if="node.kind === 'text'"
        :x="node.x"
        :y="node.y + node.runs[0]!.fontSize"
        :font-size="node.runs[0]!.fontSize"
        font-family="sans-serif"
        :fill="color(node.runs[0]!.color)"
      >{{ node.text }}</text>
    </template>
  </svg>
</template>
