<script setup lang="ts">
import {
  computed,
  inject,
  ref,
  watch,
} from 'vue'
import type { CardImage } from '@cute-screen/editor-renderer'
import { compositionImagesKey } from './image-preview'

const props = defineProps<{ image: CardImage; locale: 'ru' | 'en' }>()
const resources = inject(compositionImagesKey, undefined)
const canvas = ref<HTMLCanvasElement>()
const drawFailed = ref(false)
const source = computed(() => resources?.images.value.get(props.image.blobHash))
const failed = computed(() => !resources || drawFailed.value || (!source.value && Boolean(resources.error.value)))
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
watch([canvas, source], ([target, image]) => {
  drawFailed.value = false
  if (!target) return
  const context = target.getContext('2d')
  if (!context) {
    drawFailed.value = true
    return
  }
  context.clearRect(0, 0, target.width, target.height)
  if (!image) return
  const scale = Math.min(target.width / image.naturalWidth, target.height / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  try {
    context.drawImage(image, (target.width - width) / 2, (target.height - height) / 2, width, height)
  } catch (cause) {
    drawFailed.value = true
    console.warn('cute-screen background thumbnail failed', cause)
  }
}, { flush: 'post' })
</script>

<template>
  <div class="cs-card-image-preview" :aria-busy="!source && !failed">
    <canvas
      v-show="source && !failed"
      ref="canvas"
      width="160"
      height="120"
      role="img"
      :aria-label="text('Миниатюра фона', 'Background image preview')"
    />
    <span v-if="failed" role="status">{{ text('Нет превью', 'No preview') }}</span>
    <span v-else-if="!source" role="status">{{ text('Загрузка…', 'Loading…') }}</span>
  </div>
</template>
