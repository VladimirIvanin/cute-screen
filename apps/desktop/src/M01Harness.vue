<script setup lang="ts">
import { convertFileSrc } from '@tauri-apps/api/core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  Canvas2DRenderer,
  CanvasKitRenderer,
  RendererRuntime,
  loadBundledCanvasKit,
  type FrameMetric,
  type RendererRuntimeState,
  createRenderSceneSnapshot,
} from '@cute-screen/editor-vue/m01-harness'
import { loadImageWithBinaryFallback } from '@cute-screen/editor-vue'

import { tauriDesktopBridge } from './desktop-bridge'

const sceneCanvas = ref<HTMLCanvasElement>()
const overlayCanvas = ref<HTMLCanvasElement>()
const sceneHost = ref<HTMLDivElement>()
const runtimeState = ref<RendererRuntimeState>({
  status: 'initializing',
  backend: 'canvaskit',
})
const metric = ref<FrameMetric>()
const primaryDiagnostic = ref('none')
const transportState = ref<
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready'
      transport: 'asset' | 'binary'
      dimensions: string
      pixel: string
    }
  | { status: 'error'; message: string }
>({ status: 'idle' })
let runtime: RendererRuntime | undefined
let replacementCanvas: HTMLCanvasElement | undefined

const parameters = new URLSearchParams(window.location.search)
const requestedBackend = parameters.get('renderer')
const forceAssetFailure = parameters.get('assetFailure') === '1'
const statusLabel = computed(() => {
  const state = runtimeState.value
  if (state.status === 'initializing') return 'Initializing renderer'
  if (state.status === 'ready') return `${state.backend} ready`
  if (state.status === 'recovering') return 'Canvas2D recovery active'
  if (state.status === 'fallback') return `Canvas2D fallback · ${state.reason}`
  return 'Renderer disposed'
})

const snapshot = createRenderSceneSnapshot({
  width: 640,
  height: 360,
  nodes: [
    {
      kind: 'rect',
      id: 'diagnostic-frame',
      x: 72,
      y: 62,
      width: 228,
      height: 142,
      rotation: -4,
      opacity: 1,
      visible: true,
      fill: { red: 0.96, green: 0.88, blue: 0.83, alpha: 1 },
      stroke: { red: 0.68, green: 0.3, blue: 0.18, alpha: 1 },
      strokeWidth: 4,
    },
    {
      kind: 'ellipse',
      id: 'diagnostic-ellipse',
      centerX: 420,
      centerY: 156,
      radiusX: 104,
      radiusY: 68,
      rotation: 8,
      opacity: 0.9,
      visible: true,
      fill: { red: 0.2, green: 0.56, blue: 0.72, alpha: 1 },
    },
    {
      kind: 'line',
      id: 'diagnostic-line',
      x1: 118,
      y1: 278,
      x2: 526,
      y2: 248,
      rotation: 0,
      opacity: 1,
      visible: true,
      stroke: { red: 0.2, green: 0.68, blue: 0.42, alpha: 1 },
      strokeWidth: 8,
    },
  ],
})

function createSceneCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = snapshot.width
  canvas.height = snapshot.height
  canvas.className = 'diagnostic-canvas diagnostic-scene'
  canvas.setAttribute('aria-label', 'Fallback scene canvas')
  return canvas
}

function activateSceneCanvas(canvas: HTMLCanvasElement): void {
  const host = sceneHost.value
  if (!host) return
  for (const existing of host.querySelectorAll<HTMLCanvasElement>(
    '.diagnostic-scene',
  )) {
    existing.hidden = existing !== canvas
  }
  if (!canvas.isConnected) host.prepend(canvas)
}

onMounted(async () => {
  if (!sceneCanvas.value || !overlayCanvas.value) return
  runtime = new RendererRuntime({
    stack: {
      scene: sceneCanvas.value,
      overlay: overlayCanvas.value,
      dpr: window.devicePixelRatio,
      correlationId: 'm01-renderer-harness',
    },
    createPrimary: async () => {
      if (
        requestedBackend === 'broken-wasm' ||
        requestedBackend === 'canvas2d'
      ) {
        throw new Error('Forced CanvasKit startup failure')
      }
      return new CanvasKitRenderer(await loadBundledCanvasKit())
    },
    createFallback: () => new Canvas2DRenderer(),
    createReplacementSceneCanvas: () => {
      replacementCanvas = createSceneCanvas()
      return replacementCanvas
    },
    activateSceneCanvas,
    onStateChange: (state) => {
      runtimeState.value = state
    },
    onFrame: (frame) => {
      metric.value = frame
    },
  })
  runtime.setScene(snapshot)
  await runtime.initialize()
  runtime.invalidate('scene')
  runtime.invalidate('overlay')
})

onBeforeUnmount(() => runtime?.dispose())

function loseContext(): void {
  const canvas = sceneCanvas.value
  if (!canvas) return
  if (parameters.get('syntheticContext') === '1') {
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    return
  }
  const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
  const extension = context?.getExtension('WEBGL_lose_context')
  if (extension) extension.loseContext()
  else canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
}

function restoreContext(): void {
  const canvas = sceneCanvas.value
  if (!canvas) return
  if (parameters.get('syntheticContext') === '1') {
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    return
  }
  const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
  const extension = context?.getExtension('WEBGL_lose_context')
  if (extension) extension.restoreContext()
  else canvas.dispatchEvent(new Event('webglcontextrestored'))
}

async function verifyTransport(): Promise<void> {
  if (!runtime) return
  transportState.value = { status: 'loading' }
  try {
    let pixel = 'unavailable'
    const bridge =
      parameters.get('browserBinary') === '1'
        ? {
            ...tauriDesktopBridge,
            readImageBytes: async (token: string, correlationId: string) => {
              const serialized = (await tauriDesktopBridge.readImageBytes(
                token,
                correlationId,
              )) as unknown as number[]
              return Uint8Array.from(serialized).buffer
            },
          }
        : tauriDesktopBridge
    const result = await loadImageWithBinaryFallback({
      token: parameters.get('token') ?? 'm01-alpha-png',
      correlationId: 'm01-transport-harness',
      bridge,
      convertFileSrc: forceAssetFailure
        ? () => 'asset://forced-denial'
        : convertFileSrc,
      onPrimaryFailure: (error, assetUrl) => {
        primaryDiagnostic.value = `${assetUrl} :: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`
      },
      createResource: async (image, metadata) => {
        const probe = document.createElement('canvas')
        probe.width = 1
        probe.height = 1
        const context = probe.getContext('2d')
        context?.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1)
        pixel = context
          ? [...context.getImageData(0, 0, 1, 1).data].join(',')
          : 'unavailable'
        return runtime!.createImageResource({
          id: metadata.token,
          width: metadata.width,
          height: metadata.height,
          source: image,
        })
      },
    })
    transportState.value = {
      status: 'ready',
      transport: result.transport,
      dimensions: `${result.metadata.width}×${result.metadata.height}`,
      pixel,
    }
    runtime.invalidate('resource')
  } catch (error: unknown) {
    transportState.value = {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
</script>

<template>
  <main class="diagnostic-shell" :data-primary-diagnostic="primaryDiagnostic">
    <header class="diagnostic-header">
      <div>
        <p class="eyebrow">M01 · test harness only</p>
        <h1>Renderer and image transport</h1>
      </div>
      <p class="backend-state" role="status" aria-live="polite">
        <span class="state-indicator" aria-hidden="true"></span>
        {{ statusLabel }}
      </p>
    </header>

    <section class="diagnostic-workspace" aria-label="Renderer diagnostic">
      <div ref="sceneHost" class="diagnostic-canvas-stack">
        <canvas
          ref="sceneCanvas"
          class="diagnostic-canvas diagnostic-scene"
          width="640"
          height="360"
          aria-label="Scene canvas"
        ></canvas>
        <canvas
          ref="overlayCanvas"
          class="diagnostic-canvas diagnostic-overlay"
          width="640"
          height="360"
          aria-label="Interaction overlay canvas"
        ></canvas>
      </div>
    </section>

    <footer class="diagnostic-footer">
      <div class="diagnostic-actions">
        <button type="button" class="secondary-action" @click="loseContext">
          Lose context
        </button>
        <button type="button" class="secondary-action" @click="restoreContext">
          Restore context
        </button>
        <button
          type="button"
          :disabled="transportState.status === 'loading'"
          @click="verifyTransport"
        >
          {{
            transportState.status === 'loading'
              ? 'Decoding…'
              : 'Verify image transport'
          }}
        </button>
      </div>
      <dl class="diagnostic-metrics">
        <div>
          <dt>Nodes</dt>
          <dd>{{ metric?.nodeCount ?? '—' }}</dd>
        </div>
        <div>
          <dt>Frame</dt>
          <dd>{{ metric ? `${metric.duration.toFixed(2)} ms` : '—' }}</dd>
        </div>
        <div>
          <dt>Transport</dt>
          <dd v-if="transportState.status === 'ready'" role="status">
            {{ transportState.transport }} · {{ transportState.dimensions }} ·
            rgba({{ transportState.pixel }})
          </dd>
          <dd
            v-else-if="transportState.status === 'error'"
            role="alert"
            :title="transportState.message"
          >
            error
          </dd>
          <dd v-else>—</dd>
        </div>
      </dl>
    </footer>
  </main>
</template>
