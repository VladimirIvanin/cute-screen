<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { UiIcon } from '../icon'
import type { CanvasViewportHosts, ShellDocumentState } from '../types'

defineProps<{
  documentState: ShellDocumentState
  t: (
    key:
      | 'canvasViewport'
      | 'sceneCanvas'
      | 'interactionOverlay'
      | 'emptyTitle'
      | 'emptyDescription'
      | 'loadingEditor'
      | 'retry',
  ) => string
}>()
const emit = defineEmits<{
  hostsReady: [hosts: CanvasViewportHosts]
  retry: []
}>()
const scene = ref<HTMLCanvasElement>()
const overlay = ref<HTMLCanvasElement>()
const scrollContainer = ref<HTMLDivElement>()
onMounted(() => {
  if (scene.value && overlay.value && scrollContainer.value)
    emit('hostsReady', {
      scene: scene.value,
      overlay: overlay.value,
      scrollContainer: scrollContainer.value,
    })
})
</script>

<template>
  <main class="cs-viewport" :aria-label="t('canvasViewport')">
    <div ref="scrollContainer" class="cs-canvas-scroll">
      <div class="cs-canvas-surface">
        <canvas
          ref="scene"
          class="cs-canvas"
          :aria-label="t('sceneCanvas')"
        ></canvas>
        <canvas
          ref="overlay"
          class="cs-canvas cs-canvas-overlay"
          :aria-label="t('interactionOverlay')"
        ></canvas>
        <section
          v-if="documentState.kind === 'empty'"
          class="cs-empty-state"
          aria-labelledby="cs-empty-title"
        >
          <UiIcon name="camera" />
          <h1 id="cs-empty-title">{{ t('emptyTitle') }}</h1>
          <p>{{ t('emptyDescription') }}</p>
        </section>
        <p
          v-else-if="documentState.kind === 'loading'"
          class="cs-loading"
          role="status"
        >
          {{ t('loadingEditor') }}
        </p>
        <section
          v-else-if="documentState.kind === 'error'"
          class="cs-empty-state"
          role="alert"
        >
          <h1>{{ documentState.message }}</h1>
          <button type="button" class="cs-button" @click="emit('retry')">
            {{ t('retry') }}
          </button>
        </section>
        <div
          v-else
          class="cs-fake-artboard"
          aria-label="Test-only fake document"
        >
          <span>{{ documentState.title }}</span
          ><strong>{{ documentState.dimensions }}</strong
          ><i></i><i></i><i></i>
        </div>
      </div>
    </div>
  </main>
</template>
