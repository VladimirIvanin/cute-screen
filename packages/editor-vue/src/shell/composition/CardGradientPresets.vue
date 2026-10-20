<script setup lang="ts">
import type {
  CardBackground,
  CardColor,
} from '@cute-screen/editor-renderer'
const props = defineProps<{ value: CardBackground; locale: 'ru' | 'en' }>()
const emit = defineEmits<{ change: [value: CardBackground] }>()
const palettes = [
  { ru: 'Лаванда', en: 'Lavender', colors: ['#6a5cf6', '#e7a2d7'] },
  { ru: 'Закат', en: 'Sunset', colors: ['#ffb86b', '#f16f92', '#855bd6'] },
  { ru: 'Океан', en: 'Ocean', colors: ['#246fbe', '#56d5ce'] },
  { ru: 'Мята', en: 'Mint', colors: ['#c6f5d4', '#f3f5bb'] },
  { ru: 'Ночь', en: 'Night', colors: ['#202133', '#5d4a85'] },
  { ru: 'Бумага', en: 'Paper', colors: ['#f7f4ed', '#d8dfe7'] },
]
function color(hex: string): CardColor {
  const values = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  return { red: values[0]!, green: values[1]!, blue: values[2]!, alpha: 1 }
}
function apply(colors: string[]): void {
  const bg = props.value
  const stops = colors.map((hex, index) => ({ position: index / (colors.length - 1), color: color(hex) }))
  if (bg.kind === 'linear') emit('change', { ...bg, linear: { ...bg.linear, stops } })
  else if (bg.kind === 'radial') emit('change', { ...bg, radial: { ...bg.radial, stops } })
  else emit('change', { ...bg, freeform: { ...bg.freeform,
    points: bg.freeform.points.map((point, index) => ({ ...point, color: color(colors[index % colors.length]!) })) } })
}
</script>
<template>
  <div
    class="cs-card-palettes"
    role="group"
    :aria-label="locale === 'ru' ? 'Готовые градиенты' : 'Gradient presets'"
  >
    <button
      v-for="palette in palettes"
      :key="palette.en"
      type="button"
      :title="palette[locale]"
      :aria-label="palette[locale]"
      :style="{ background: `linear-gradient(135deg, ${palette.colors.join(',')})` }"
      @click="apply(palette.colors)"
    />
  </div>
</template>
