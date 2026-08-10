<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import {
  Canvas2DRenderer,
  CanvasKitRenderer,
  RendererRuntime,
  createRenderSceneSnapshot,
  loadBundledCanvasKit,
  type FrameMetric,
  type FrameProbe,
} from '@cute-screen/editor-renderer'
import referenceImageUrl from '../../../tests/fixtures/generated/ui-4k.png'

type GpuTimerExtension = {
  readonly TIME_ELAPSED_EXT: number
  readonly GPU_DISJOINT_EXT: number
}

type ReferenceReport = {
  readonly fixtureSha256: string
  readonly backend: 'canvaskit'
  readonly renderer: string
  readonly userAgent: string
  readonly width: number
  readonly height: number
  readonly dpr: number
  readonly warmups: number
  readonly measurements: number
  readonly gpuP50: number
  readonly gpuP95: number
  readonly gpuMax: number
  readonly cpuP95: number
  readonly idleFrameCount: number
  readonly pointerOverlayP95: number
  readonly disjoint: false
}

declare global {
  interface Window {
    __cuteScreenReferencePerf?: { run(): Promise<ReferenceReport> }
  }
}

const sceneCanvas = ref<HTMLCanvasElement>()
const overlayCanvas = ref<HTMLCanvasElement>()
const status = ref('Preparing reference performance harness')
let runtime: RendererRuntime | undefined
let imageResource: { dispose(): void } | undefined
let frameMetric: FrameMetric | undefined
let idleFrameCount = 0
let measuringIdle = false

const scene = createRenderSceneSnapshot({
  width: 3840,
  height: 2160,
  nodes: Array.from({ length: 500 }, (_, index) => {
    const x = (index * 83) % 3700
    const y = (index * 47) % 2060
    if (index === 0) {
      return {
        kind: 'image' as const,
        id: 'reference-base',
        resourceId: 'reference-4k',
        x: 0,
        y: 0,
        width: 3840,
        height: 2160,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
      }
    }
    switch (index % 3) {
      case 0:
        return {
          kind: 'rect' as const,
          id: `rect-${index}`,
          x,
          y,
          width: 120,
          height: 72,
          rotation: index % 19,
          opacity: 0.82,
          visible: true,
          fill: { red: 0.82, green: 0.24, blue: 0.18, alpha: 1 },
          stroke: { red: 0.18, green: 0.08, blue: 0.04, alpha: 1 },
          strokeWidth: 3,
        }
      case 1:
        return {
          kind: 'ellipse' as const,
          id: `ellipse-${index}`,
          centerX: x + 48,
          centerY: y + 32,
          radiusX: 48,
          radiusY: 32,
          rotation: -(index % 17),
          opacity: 0.76,
          visible: true,
          fill: { red: 0.12, green: 0.52, blue: 0.86, alpha: 1 },
        }
      default:
        return {
          kind: 'line' as const,
          id: `line-${index}`,
          x1: x,
          y1: y,
          x2: x + 140,
          y2: y + 64,
          rotation: 0,
          opacity: 1,
          visible: true,
          stroke: { red: 0.12, green: 0.7, blue: 0.4, alpha: 1 },
          strokeWidth: 6,
        }
    }
  }),
})

function percentile(samples: readonly number[], quantile: number): number {
  const ordered = [...samples].sort((left, right) => left - right)
  return ordered[Math.max(0, Math.ceil(quantile * ordered.length) - 1)]!
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}

async function loadReferenceImage(): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = referenceImageUrl
  await image.decode()
  return image
}

async function runReferenceBenchmark(): Promise<ReferenceReport> {
  if (!runtime || !sceneCanvas.value)
    throw new Error('Reference runtime is not ready')
  const gl = sceneCanvas.value.getContext('webgl2')
  if (!gl) throw new Error('WebGL2 is unavailable on reference Tauri canvas')
  const extension = gl.getExtension(
    'EXT_disjoint_timer_query_webgl2',
  ) as GpuTimerExtension | null
  if (!extension)
    throw new Error('EXT_disjoint_timer_query_webgl2 is unavailable')
  const debug = gl.getExtension('WEBGL_debug_renderer_info') as {
    readonly UNMASKED_RENDERER_WEBGL: number
  } | null
  if (!debug) throw new Error('WEBGL_debug_renderer_info is unavailable')
  const renderer = String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
  if (/swiftshader|llvmpipe|software/i.test(renderer)) {
    throw new Error(`Reference host has software WebGL renderer: ${renderer}`)
  }

  const pending: WebGLQuery[] = []
  const probe: FrameProbe = {
    beforeFrame: (reasons) => {
      if (!reasons.includes('scene')) return
      const query = gl.createQuery()
      if (!query) throw new Error('WebGL timer query allocation failed')
      pending.push(query)
      gl.beginQuery(extension.TIME_ELAPSED_EXT, query)
    },
    afterFrame: (metric) => {
      if (!metric.reasons.includes('scene')) return
      gl.endQuery(extension.TIME_ELAPSED_EXT)
      frameMetric = metric
    },
  }
  runtime.dispose()
  runtime = await createRuntime(probe)
  const image = await loadReferenceImage()
  imageResource = await runtime.createImageResource({
    id: 'reference-4k',
    width: image.naturalWidth,
    height: image.naturalHeight,
    source: image,
  })
  runtime.setScene(scene)

  const render = async (): Promise<{ gpu: number; cpu: number }> => {
    frameMetric = undefined
    runtime!.invalidate('scene')
    while (!frameMetric) await waitForFrame()
    const query = pending.shift()
    if (!query) throw new Error('GPU timer probe did not receive a scene query')
    while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
      if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
        gl.deleteQuery(query)
        throw new Error('GPU_DISJOINT occurred during reference measurement')
      }
      await waitForFrame()
    }
    if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
      gl.deleteQuery(query)
      throw new Error('GPU_DISJOINT occurred during reference measurement')
    }
    const gpu = Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1_000_000
    gl.deleteQuery(query)
    const metric = frameMetric as FrameMetric | undefined
    if (!metric) throw new Error('Reference frame metric is unavailable')
    return { gpu, cpu: metric.duration }
  }

  for (let index = 0; index < 30; index += 1) await render()
  const samples: Array<{ gpu: number; cpu: number }> = []
  for (let index = 0; index < 120; index += 1) samples.push(await render())
  idleFrameCount = 0
  measuringIdle = true
  await new Promise((resolve) => window.setTimeout(resolve, 80))
  measuringIdle = false
  const pointerSamples = Array.from({ length: 120 }, () => {
    const started = performance.now()
    const overlay = overlayCanvas.value?.getContext('2d')
    overlay?.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height)
    return performance.now() - started
  })
  return {
    fixtureSha256:
      'b4c84b61cc04d893e1523f81bc56fff1d127ca702c0c8220bf0224cd9915fa98',
    backend: 'canvaskit',
    renderer,
    userAgent: navigator.userAgent,
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio,
    warmups: 30,
    measurements: 120,
    gpuP50: percentile(
      samples.map((sample) => sample.gpu),
      0.5,
    ),
    gpuP95: percentile(
      samples.map((sample) => sample.gpu),
      0.95,
    ),
    gpuMax: Math.max(...samples.map((sample) => sample.gpu)),
    cpuP95: percentile(
      samples.map((sample) => sample.cpu),
      0.95,
    ),
    idleFrameCount,
    pointerOverlayP95: percentile(pointerSamples, 0.95),
    disjoint: false,
  }
}

async function createRuntime(
  frameProbe?: FrameProbe,
): Promise<RendererRuntime> {
  if (!sceneCanvas.value || !overlayCanvas.value)
    throw new Error('Canvas stack is missing')
  const next = new RendererRuntime({
    stack: {
      scene: sceneCanvas.value,
      overlay: overlayCanvas.value,
      dpr: window.devicePixelRatio,
      correlationId: 'm05-reference-performance',
    },
    createPrimary: async () =>
      new CanvasKitRenderer(await loadBundledCanvasKit()),
    createFallback: () => new Canvas2DRenderer(),
    createReplacementSceneCanvas: () => {
      throw new Error('CanvasKit fallback is forbidden on the reference runner')
    },
    activateSceneCanvas: () => undefined,
    frameProbe,
    onFrame: () => {
      if (measuringIdle) idleFrameCount += 1
    },
  })
  await next.initialize()
  if (next.state.backend !== 'canvaskit')
    throw new Error('CanvasKit fallback is forbidden')
  return next
}

onMounted(async () => {
  try {
    runtime = await createRuntime()
    status.value = 'Reference performance harness ready'
    window.__cuteScreenReferencePerf = { run: runReferenceBenchmark }
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error)
  }
})

onBeforeUnmount(() => {
  imageResource?.dispose()
  runtime?.dispose()
  delete window.__cuteScreenReferencePerf
})
</script>

<template>
  <main class="reference-perf" aria-label="M05 reference performance harness">
    <canvas ref="sceneCanvas" width="3840" height="2160"></canvas>
    <canvas ref="overlayCanvas" width="1600" height="1000"></canvas>
    <p role="status">{{ status }}</p>
  </main>
</template>

<style scoped>
.reference-perf {
  width: 1600px;
  height: 1000px;
  overflow: hidden;
}
.reference-perf canvas {
  display: block;
  width: 1600px;
  height: 900px;
}
.reference-perf canvas + canvas {
  display: none;
}
</style>
