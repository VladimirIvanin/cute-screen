<script setup lang="ts">
import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { loadImageWithBinaryFallback } from '../../image-transport'
import { compositionImagesKey } from './image-preview'

const props = defineProps<{
  blobHash?: string | null | undefined
  valueJson?: string | undefined
  locale: 'ru' | 'en'
  label: string
}>()
const resources = inject(compositionImagesKey, undefined)
const canvas = ref<HTMLCanvasElement>()
const host = ref<HTMLElement>()
const visible = ref(typeof IntersectionObserver === 'undefined')
let observer: IntersectionObserver | undefined
onMounted(() => {
  if (visible.value || !host.value) return
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    visible.value = true
    observer?.disconnect()
  })
  observer.observe(host.value)
})
const state = ref<'loading' | 'ready' | 'error' | 'cancelled'>('loading')
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
const hash = computed(() => {
  if (props.blobHash) return props.blobHash
  if (!props.valueJson) return undefined
  try {
    const value: unknown = JSON.parse(props.valueJson)
    if (
      value &&
      typeof value === 'object' &&
      'blobHash' in value &&
      typeof value.blobHash === 'string'
    ) {
      return value.blobHash
    }
  } catch (cause) {
    console.warn('cute-screen logo preview metadata failed', cause)
  }
  return undefined
})
let generation = 0
onBeforeUnmount(() => {
  generation++
  observer?.disconnect()
})
watch([canvas, hash, visible, () => resources?.images.value.get(hash.value ?? '')], async ([target, blobHash, shown, source]) => {
  const current = ++generation
  if (!target || !shown) return
  state.value = 'loading'
  const draw = (image: HTMLImageElement): void => {
    if (current !== generation) return
    const context = target.getContext('2d')
    if (!context) throw new Error('Logo preview canvas is unavailable')
    const scale = Math.min(88 / image.naturalWidth, 88 / image.naturalHeight)
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale
    context.clearRect(0, 0, 96, 96)
    context.drawImage(image, (96 - width) / 2, (96 - height) / 2, width, height)
    state.value = 'ready'
  }
  const bridge = resources?.bridge?.()
  let token: string | undefined
  try {
    if (!blobHash || !/^[a-f0-9]{64}$/u.test(blobHash)) throw new Error('Logo reference is invalid')
    if (source) {
      draw(source)
      return
    }
    if (!bridge) throw new Error('Logo preview transport is unavailable')
    const outcome = await bridge.resolveTexture(blobHash, crypto.randomUUID())
    if (outcome.kind === 'cancelled') {
      if (current === generation) state.value = 'cancelled'
      return
    }
    token = outcome.resourceToken
    if (current !== generation) return
    if (outcome.blobHash !== blobHash) throw new Error('Logo preview reference mismatch')
    await loadImageWithBinaryFallback({ token, bridge, correlationId: crypto.randomUUID(),
      createResource: async (image) => {
        draw(image)
      } })
  } catch (cause) {
    if (current === generation) {
      state.value = 'error'
      console.warn('cute-screen logo preview failed', cause)
    }
  } finally {
    if (token) await bridge?.releaseImage?.(token).catch((cause: unknown) => {
      console.warn('cute-screen logo preview release failed', cause)
    })
  }
}, { flush: 'post' })
</script>

<template>
  <span
    ref="host"
    class="cs-logo-preview"
    role="img"
    :aria-label="label"
    :aria-busy="state === 'loading'"
    :data-preview-state="state"
    :title="state === 'error' ? text('Не удалось загрузить логотип', 'Could not load logo') : state === 'cancelled' ? text('Загрузка отменена', 'Loading cancelled') : label"
  >
    <canvas
      ref="canvas"
      v-show="state === 'ready'"
      width="96"
      height="96"
      aria-hidden="true"
    />
    <span v-if="state !== 'ready'" aria-hidden="true">{{ state === 'loading' ? '…' : state === 'cancelled' ? '—' : '!' }}</span>
  </span>
</template>
