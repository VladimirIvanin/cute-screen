<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { UiIcon } from '../icon'
import type { CanvasViewportHosts, ShellDocumentState } from '../types'
import {
  Canvas2DRenderer,
  createDocumentRenderScene,
  hitTestDocument,
  hitTestDocumentAll,
  snapPoint,
  type EditorDocumentV1,
  type ImageLayer,
  type LayerNode,
  type SnapCandidate,
  type Transform2D,
  type ImageResource,
} from '@cute-screen/editor-renderer'

const props = defineProps<{
  documentState: ShellDocumentState
  canvas?: { readonly width: number; readonly height: number } | undefined
  image?: HTMLImageElement | undefined
  imageLayer?: ImageLayer | undefined
  document?: EditorDocumentV1 | undefined
  selectedLayerId?: string | undefined
  selectedLayerIds?: readonly string[] | undefined
  activeTool?: string | undefined
  zoom?: number | undefined
  fitMode?: boolean | undefined
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
  selectLayer: [id: string, toggle: boolean]
  moveLayer: [id: string, deltaX: number, deltaY: number]
  transformLayer: [id: string, transform: Transform2D]
  zoom: [value: number]
  fitZoom: [value: number]
  retry: []
}>()
const scene = ref<HTMLCanvasElement>()
const overlay = ref<HTMLCanvasElement>()
const scrollContainer = ref<HTMLDivElement>()
const rendererError = ref<string>()
let renderer: Canvas2DRenderer | undefined
let imageResource: ImageResource | undefined
let activeImageKey: string | undefined
let resizeObserver: ResizeObserver | undefined
let pendingZoomAnchor:
  | {
      readonly canvas: CanvasPoint
      readonly clientX: number
      readonly clientY: number
    }
  | undefined
let spacePressed = false
let cycle:
  | { readonly key: string; readonly at: number; readonly index: number }
  | undefined
let gesture:
  | {
      readonly kind: 'pan'
      readonly clientX: number
      readonly clientY: number
      readonly scrollLeft: number
      readonly scrollTop: number
    }
  | {
      readonly kind: 'move'
      readonly id: string
      readonly start: { x: number; y: number }
      readonly current: { x: number; y: number }
      readonly guides: readonly SnapCandidate[]
      readonly guidesVisible: boolean
    }
  | {
      readonly kind: 'resize'
      readonly id: string
      readonly handle: ResizeHandle
      readonly start: { x: number; y: number }
      readonly current: { x: number; y: number }
      readonly initial: Transform2D
      readonly freeResize: boolean
      readonly centerResize: boolean
    }
  | {
      readonly kind: 'rotate'
      readonly id: string
      readonly center: { x: number; y: number }
      readonly startAngle: number
      readonly initial: Transform2D
      readonly currentAngle: number
    }
  | undefined

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type CanvasPoint = { readonly x: number; readonly y: number }
async function ensureRenderer(): Promise<Canvas2DRenderer | undefined> {
  if (!scene.value || !overlay.value || !props.canvas) return undefined
  if (renderer) return renderer
  const next = new Canvas2DRenderer()
  await next.initialize({
    scene: scene.value,
    overlay: overlay.value,
    dpr: window.devicePixelRatio || 1,
    correlationId: 'editor-viewport',
  })
  renderer = next
  return next
}
async function drawDocument(): Promise<void> {
  if (!scene.value || !props.canvas) return
  rendererError.value = undefined
  scene.value.width = props.canvas.width
  scene.value.height = props.canvas.height
  if (overlay.value) {
    overlay.value.width = props.canvas.width
    overlay.value.height = props.canvas.height
  }
  const layer = props.imageLayer
  if (!props.document || !props.image || !layer) {
    const context = scene.value.getContext('2d')
    context?.clearRect(0, 0, scene.value.width, scene.value.height)
    invalidateOverlay()
    return
  }
  try {
    const runtime = await ensureRenderer()
    if (!runtime) return
    const imageKey = `${layer.payload.blobHash}:${props.image.currentSrc || props.image.src}`
    if (activeImageKey !== imageKey) {
      imageResource?.dispose()
      imageResource = await runtime.createImageResource({
        id: layer.payload.blobHash,
        width: props.image.naturalWidth,
        height: props.image.naturalHeight,
        source: props.image,
      })
      activeImageKey = imageKey
    }
    runtime.setScene(createDocumentRenderScene(props.document))
    runtime.render(['scene'])
  } catch (error) {
    renderer?.dispose()
    renderer = undefined
    imageResource = undefined
    activeImageKey = undefined
    rendererError.value = error instanceof Error ? error.message : String(error)
  }
  invalidateOverlay()
}
function fitCanvas(): void {
  const container = scrollContainer.value
  const canvas = props.canvas
  if (!props.fitMode || !container || !canvas) return
  const availableWidth = container.clientWidth - 48
  const availableHeight = container.clientHeight - 48
  if (availableWidth <= 0 || availableHeight <= 0) return
  const scale = Math.min(
    availableWidth / canvas.width,
    availableHeight / canvas.height,
  )
  emit('fitZoom', Math.round(scale * 100))
}
function retryRender(): void {
  void drawDocument()
}
function selectedLayer(): LayerNode | undefined {
  return props.document?.layers.find(
    (layer) => layer.id === props.selectedLayerId,
  )
}
function transformPoint(
  transform: Transform2D,
  point: CanvasPoint,
): CanvasPoint {
  const radians = (transform.rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return {
    x:
      point.x * transform.scaleX * cosine -
      point.y * transform.scaleY * sine +
      transform.translateX,
    y:
      point.x * transform.scaleX * sine +
      point.y * transform.scaleY * cosine +
      transform.translateY,
  }
}
function toLocal(layer: LayerNode, point: CanvasPoint): CanvasPoint {
  const radians = (-layer.transform.rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const x = point.x - layer.transform.translateX
  const y = point.y - layer.transform.translateY
  return {
    x: (x * cosine - y * sine) / layer.transform.scaleX,
    y: (x * sine + y * cosine) / layer.transform.scaleY,
  }
}
function layerBounds(layer: LayerNode) {
  return layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
}
function snapCandidates(excludingId: string): readonly SnapCandidate[] {
  const document = props.document
  if (!document) return []
  const candidates: SnapCandidate[] = [
    { id: 'canvas-top-left', x: 0, y: 0 },
    {
      id: 'canvas-center',
      x: document.canvas.width / 2,
      y: document.canvas.height / 2,
    },
    {
      id: 'canvas-bottom-right',
      x: document.canvas.width,
      y: document.canvas.height,
    },
  ]
  if (document.crop) {
    candidates.push(
      { id: 'crop-top-left', x: document.crop.x, y: document.crop.y },
      {
        id: 'crop-bottom-right',
        x: document.crop.x + document.crop.width,
        y: document.crop.y + document.crop.height,
      },
      {
        id: 'crop-center',
        x: document.crop.x + document.crop.width / 2,
        y: document.crop.y + document.crop.height / 2,
      },
    )
  }
  for (const layer of document.layers) {
    if (layer.id === excludingId || !layer.visible) continue
    const bounds = layerBounds(layer)
    candidates.push(
      {
        id: `${layer.id}:start`,
        x: transformPoint(layer.transform, { x: bounds.x, y: bounds.y }).x,
        y: transformPoint(layer.transform, { x: bounds.x, y: bounds.y }).y,
      },
      {
        id: `${layer.id}:center`,
        x: transformPoint(layer.transform, {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        }).x,
        y: transformPoint(layer.transform, {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        }).y,
      },
      {
        id: `${layer.id}:end`,
        x: transformPoint(layer.transform, {
          x: bounds.x + bounds.width,
          y: bounds.y + bounds.height,
        }).x,
        y: transformPoint(layer.transform, {
          x: bounds.x + bounds.width,
          y: bounds.y + bounds.height,
        }).y,
      },
    )
  }
  return candidates
}
function resizeTransform(
  layer: LayerNode,
  handle: ResizeHandle,
  point: CanvasPoint,
  freeResize: boolean,
  centerResize: boolean,
): Transform2D {
  const bounds = layerBounds(layer)
  const local = toLocal(layer, point)
  const resizesX = handle.includes('w') || handle.includes('e')
  const resizesY = handle.includes('n') || handle.includes('s')
  const opposite = centerResize
    ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    : {
        x: handle.includes('w') ? bounds.x + bounds.width : bounds.x,
        y: handle.includes('n') ? bounds.y + bounds.height : bounds.y,
      }
  const corner = {
    x: handle.includes('w') ? bounds.x : bounds.x + bounds.width,
    y: handle.includes('n') ? bounds.y : bounds.y + bounds.height,
  }
  const minScale = 1 / Math.max(bounds.width, bounds.height)
  let factorX = resizesX ? (local.x - opposite.x) / (corner.x - opposite.x) : 1
  let factorY = resizesY ? (local.y - opposite.y) / (corner.y - opposite.y) : 1
  factorX = Math.max(minScale, factorX)
  factorY = Math.max(minScale, factorY)
  if (layer.kind === 'image' && !freeResize) {
    const factor =
      resizesX && !resizesY
        ? factorX
        : !resizesX && resizesY
          ? factorY
          : Math.abs(factorX - 1) >= Math.abs(factorY - 1)
            ? factorX
            : factorY
    factorX = factor
    factorY = factor
  }
  const nextScaleX = layer.transform.scaleX * factorX
  const nextScaleY = layer.transform.scaleY * factorY
  const anchor = transformPoint(layer.transform, opposite)
  const rotation = (layer.transform.rotation * Math.PI) / 180
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  return {
    scaleX: nextScaleX,
    scaleY: nextScaleY,
    rotation: layer.transform.rotation,
    translateX:
      anchor.x -
      opposite.x * nextScaleX * cosine +
      opposite.y * nextScaleY * sine,
    translateY:
      anchor.y -
      opposite.x * nextScaleX * sine -
      opposite.y * nextScaleY * cosine,
  }
}
function previewTransform(layer: LayerNode): Transform2D {
  if (!gesture || gesture.kind === 'pan' || gesture.id !== layer.id) {
    return layer.transform
  }
  if (gesture.kind === 'move') {
    return {
      ...layer.transform,
      translateX:
        layer.transform.translateX + gesture.current.x - gesture.start.x,
      translateY:
        layer.transform.translateY + gesture.current.y - gesture.start.y,
    }
  }
  if (gesture.kind === 'resize') {
    return resizeTransform(
      layer,
      gesture.handle,
      gesture.current,
      gesture.freeResize,
      gesture.centerResize,
    )
  }
  if (gesture.kind === 'rotate') {
    return { ...gesture.initial, rotation: gesture.currentAngle }
  }
  return layer.transform
}
function drawOverlay(): void {
  if (!overlay.value || !props.canvas) return
  const context = overlay.value.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, overlay.value.width, overlay.value.height)
  const layer = selectedLayer()
  if (!layer || !layer.visible) return
  const transform = previewTransform(layer)
  const bounds = layerBounds(layer)
  context.save()
  context.translate(transform.translateX, transform.translateY)
  context.rotate((transform.rotation * Math.PI) / 180)
  context.scale(transform.scaleX, transform.scaleY)
  context.lineWidth =
    1 / Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY), 1)
  context.strokeStyle = '#d9773b'
  context.setLineDash([4, 3])
  context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
  context.setLineDash([])
  context.restore()
  const handlePositions: readonly CanvasPoint[] = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width / 2, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height / 2 },
  ]
  const handleHalfSize = 3 / ((props.zoom ?? 100) / 100)
  context.fillStyle = '#fff'
  context.strokeStyle = '#d9773b'
  for (const position of handlePositions) {
    const canvasPosition = transformPoint(transform, position)
    context.fillRect(
      canvasPosition.x - handleHalfSize,
      canvasPosition.y - handleHalfSize,
      handleHalfSize * 2,
      handleHalfSize * 2,
    )
    context.strokeRect(
      canvasPosition.x - handleHalfSize,
      canvasPosition.y - handleHalfSize,
      handleHalfSize * 2,
      handleHalfSize * 2,
    )
  }
  const topCenter = transformPoint(transform, {
    x: bounds.x + bounds.width / 2,
    y: bounds.y,
  })
  const center = transformPoint(transform, {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  })
  const vectorLength =
    Math.hypot(topCenter.x - center.x, topCenter.y - center.y) || 1
  const rotateHandle = {
    x: topCenter.x + ((topCenter.x - center.x) / vectorLength) * 22,
    y: topCenter.y + ((topCenter.y - center.y) / vectorLength) * 22,
  }
  context.beginPath()
  context.moveTo(topCenter.x, topCenter.y)
  context.lineTo(rotateHandle.x, rotateHandle.y)
  context.stroke()
  context.beginPath()
  context.arc(rotateHandle.x, rotateHandle.y, 5, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  if (gesture?.kind === 'move' && gesture.guidesVisible) {
    context.save()
    context.strokeStyle = '#d9773b'
    context.lineWidth = 1 / ((props.zoom ?? 100) / 100)
    context.setLineDash([
      3 / ((props.zoom ?? 100) / 100),
      3 / ((props.zoom ?? 100) / 100),
    ])
    for (const guide of gesture.guides) {
      context.beginPath()
      context.moveTo(guide.x, 0)
      context.lineTo(guide.x, props.canvas.height)
      context.moveTo(0, guide.y)
      context.lineTo(props.canvas.width, guide.y)
      context.stroke()
    }
    context.restore()
  }
}
function invalidateOverlay(): void {
  // Interaction state is non-reactive; only the lightweight overlay updates
  // during pointer movement, never the committed scene or Vue tree.
  drawOverlay()
}
onMounted(() => {
  if (scene.value && overlay.value && scrollContainer.value)
    emit('hostsReady', {
      scene: scene.value,
      overlay: overlay.value,
      scrollContainer: scrollContainer.value,
    })
  void drawDocument()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(fitCanvas)
    if (scrollContainer.value) resizeObserver.observe(scrollContainer.value)
  }
  void nextTick(fitCanvas)
})
watch(
  () => [props.canvas, props.image, props.imageLayer, props.document],
  () => void drawDocument(),
)
watch(
  () => [props.selectedLayerId, props.selectedLayerIds],
  () => invalidateOverlay(),
)
watch(
  () => [props.canvas, props.fitMode],
  () => void nextTick(fitCanvas),
)
watch(
  () => props.zoom,
  async (zoom) => {
    const anchor = pendingZoomAnchor
    if (!anchor || !scrollContainer.value || !scene.value || !zoom) return
    pendingZoomAnchor = undefined
    await nextTick()
    const viewport = scrollContainer.value.getBoundingClientRect()
    const scale = zoom / 100
    scrollContainer.value.scrollLeft = Math.max(
      0,
      anchor.canvas.x * scale - (anchor.clientX - viewport.left),
    )
    scrollContainer.value.scrollTop = Math.max(
      0,
      anchor.canvas.y * scale - (anchor.clientY - viewport.top),
    )
  },
)
function canvasPoint(event: {
  readonly clientX: number
  readonly clientY: number
}): { x: number; y: number } | undefined {
  if (!scene.value || !props.document) return undefined
  const rect = scene.value.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) * scene.value.width) / rect.width,
    y: ((event.clientY - rect.top) * scene.value.height) / rect.height,
  }
}
function handleAtPoint(
  layer: LayerNode,
  point: CanvasPoint,
): ResizeHandle | 'rotate' | undefined {
  const bounds = layerBounds(layer)
  const handles: readonly [ResizeHandle, CanvasPoint][] = [
    ['nw', transformPoint(layer.transform, { x: bounds.x, y: bounds.y })],
    [
      'n',
      transformPoint(layer.transform, {
        x: bounds.x + bounds.width / 2,
        y: bounds.y,
      }),
    ],
    [
      'ne',
      transformPoint(layer.transform, {
        x: bounds.x + bounds.width,
        y: bounds.y,
      }),
    ],
    [
      'e',
      transformPoint(layer.transform, {
        x: bounds.x + bounds.width,
        y: bounds.y + bounds.height / 2,
      }),
    ],
    [
      'sw',
      transformPoint(layer.transform, {
        x: bounds.x,
        y: bounds.y + bounds.height,
      }),
    ],
    [
      's',
      transformPoint(layer.transform, {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height,
      }),
    ],
    [
      'se',
      transformPoint(layer.transform, {
        x: bounds.x + bounds.width,
        y: bounds.y + bounds.height,
      }),
    ],
    [
      'w',
      transformPoint(layer.transform, {
        x: bounds.x,
        y: bounds.y + bounds.height / 2,
      }),
    ],
  ]
  const tolerance = 9 / ((props.zoom ?? 100) / 100)
  for (const [handle, position] of handles) {
    if (Math.hypot(position.x - point.x, position.y - point.y) <= tolerance) {
      return handle
    }
  }
  const center = transformPoint(layer.transform, {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  })
  const topCenter = transformPoint(layer.transform, {
    x: bounds.x + bounds.width / 2,
    y: bounds.y,
  })
  const length = Math.hypot(topCenter.x - center.x, topCenter.y - center.y) || 1
  const rotateHandle = {
    x: topCenter.x + ((topCenter.x - center.x) / length) * 22,
    y: topCenter.y + ((topCenter.y - center.y) / length) * 22,
  }
  return Math.hypot(rotateHandle.x - point.x, rotateHandle.y - point.y) <=
    tolerance
    ? 'rotate'
    : undefined
}
function onPointerDown(event: PointerEvent): void {
  const point = canvasPoint(event)
  if (!point || !scene.value || !props.document) return
  const pan = event.button === 1 || props.activeTool === 'hand' || spacePressed
  if (pan && scrollContainer.value) {
    event.preventDefault()
    scene.value.setPointerCapture(event.pointerId)
    gesture = {
      kind: 'pan',
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: scrollContainer.value.scrollLeft,
      scrollTop: scrollContainer.value.scrollTop,
    }
    return
  }
  if (event.button !== 0) return
  const selected = selectedLayer()
  const handle =
    selected && !selected.locked ? handleAtPoint(selected, point) : undefined
  if (selected && handle) {
    scene.value.setPointerCapture(event.pointerId)
    if (handle === 'rotate') {
      const bounds = layerBounds(selected)
      const center = transformPoint(selected.transform, {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      })
      const angle = Math.atan2(point.y - center.y, point.x - center.x)
      gesture = {
        kind: 'rotate',
        id: selected.id,
        center,
        startAngle: angle,
        initial: selected.transform,
        currentAngle: selected.transform.rotation,
      }
    } else {
      gesture = {
        kind: 'resize',
        id: selected.id,
        handle,
        start: point,
        current: point,
        initial: selected.transform,
        freeResize: event.shiftKey,
        centerResize: event.altKey,
      }
    }
    return
  }
  const hits = hitTestDocumentAll(props.document, point)
  const key = hits.map((hit) => hit.nodeId).join(':')
  const now = performance.now()
  const previousCycle = cycle
  const shouldCycle =
    event.detail > 1 &&
    previousCycle !== undefined &&
    previousCycle.key === key &&
    now - previousCycle.at <= 1000
  const index =
    hits.length === 0
      ? 0
      : shouldCycle
        ? (previousCycle.index + 1) % hits.length
        : 0
  cycle = { key, at: now, index }
  const hit = hits[index] ?? hitTestDocument(props.document, point)
  if (!hit) return
  emit('selectLayer', hit.nodeId, event.metaKey || event.ctrlKey)
  scene.value.setPointerCapture(event.pointerId)
  gesture = {
    kind: 'move',
    id: hit.nodeId,
    start: point,
    current: point,
    guides: [],
    guidesVisible: false,
  }
}
function onDoubleClick(event: MouseEvent): void {
  const point = canvasPoint(event)
  if (!point || !props.document) return
  const hits = hitTestDocumentAll(props.document, point)
  if (hits.length < 2) return
  const key = hits.map((hit) => hit.nodeId).join(':')
  const currentIndex = hits.findIndex(
    (hit) => hit.nodeId === props.selectedLayerId,
  )
  const index = currentIndex < 0 ? 0 : (currentIndex + 1) % hits.length
  cycle = { key, at: performance.now(), index }
  emit('selectLayer', hits[index]!.nodeId, event.metaKey || event.ctrlKey)
}
function onPointerMove(event: PointerEvent): void {
  const point = canvasPoint(event)
  if (!point || !gesture) return
  if (gesture.kind === 'pan' && scrollContainer.value) {
    scrollContainer.value.scrollLeft =
      gesture.scrollLeft - (event.clientX - gesture.clientX)
    scrollContainer.value.scrollTop =
      gesture.scrollTop - (event.clientY - gesture.clientY)
    return
  }
  if (gesture.kind === 'move') {
    const result = snapPoint(
      point,
      snapCandidates(gesture.id),
      (props.zoom ?? 100) / 100,
      !event.ctrlKey && !event.metaKey,
    )
    gesture = {
      ...gesture,
      current: { x: result.x, y: result.y },
      guides: result.guides,
      guidesVisible: event.altKey,
    }
    invalidateOverlay()
    return
  }
  if (gesture.kind === 'resize') {
    gesture = {
      ...gesture,
      current: point,
      freeResize: event.shiftKey,
      centerResize: event.altKey,
    }
    invalidateOverlay()
    return
  }
  if (gesture.kind === 'rotate') {
    const angle = Math.atan2(
      point.y - gesture.center.y,
      point.x - gesture.center.x,
    )
    let rotation =
      gesture.initial.rotation + ((angle - gesture.startAngle) * 180) / Math.PI
    if (event.shiftKey) rotation = Math.round(rotation / 15) * 15
    gesture = { ...gesture, currentAngle: rotation }
    invalidateOverlay()
  }
}
function finishGesture(event: PointerEvent): void {
  const completed = gesture
  gesture = undefined
  if (scene.value?.hasPointerCapture(event.pointerId)) {
    scene.value.releasePointerCapture(event.pointerId)
  }
  if (completed?.kind === 'move') {
    const deltaX = completed.current.x - completed.start.x
    const deltaY = completed.current.y - completed.start.y
    if (deltaX !== 0 || deltaY !== 0) {
      emit('moveLayer', completed.id, deltaX, deltaY)
    }
  }
  if (completed?.kind === 'resize') {
    const layer = props.document?.layers.find(
      (candidate) => candidate.id === completed.id,
    )
    if (
      layer &&
      (completed.current.x !== completed.start.x ||
        completed.current.y !== completed.start.y)
    ) {
      const transform = resizeTransform(
        layer,
        completed.handle,
        completed.current,
        completed.freeResize,
        completed.centerResize,
      )
      emit('transformLayer', completed.id, transform)
    }
  }
  if (
    completed?.kind === 'rotate' &&
    completed.currentAngle !== completed.initial.rotation
  ) {
    emit('transformLayer', completed.id, {
      ...completed.initial,
      rotation: completed.currentAngle,
    })
  }
  invalidateOverlay()
}
function onWheel(event: WheelEvent): void {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  const point = canvasPoint(event)
  if (point) {
    pendingZoomAnchor = {
      canvas: point,
      clientX: event.clientX,
      clientY: event.clientY,
    }
  }
  const current = props.zoom ?? 100
  emit('zoom', Math.round(current * (event.deltaY < 0 ? 1.1 : 1 / 1.1)))
}
function onWindowKeydown(event: KeyboardEvent): void {
  if (
    event.code === 'Space' &&
    !(event.target instanceof HTMLInputElement) &&
    !(event.target instanceof HTMLTextAreaElement)
  ) {
    spacePressed = true
  }
}
function onWindowKeyup(event: KeyboardEvent): void {
  if (event.code === 'Space') spacePressed = false
  if (event.key === 'Alt' && gesture?.kind === 'move') {
    gesture = { ...gesture, guidesVisible: false }
    invalidateOverlay()
  }
}
function onWindowBlur(): void {
  spacePressed = false
  gesture = undefined
  invalidateOverlay()
}
onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('keyup', onWindowKeyup)
  window.addEventListener('blur', onWindowBlur)
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = undefined
  imageResource?.dispose()
  imageResource = undefined
  renderer?.dispose()
  renderer = undefined
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('keyup', onWindowKeyup)
  window.removeEventListener('blur', onWindowBlur)
})
</script>

<template>
  <main class="cs-viewport" :aria-label="t('canvasViewport')">
    <div ref="scrollContainer" class="cs-canvas-scroll">
      <div
        class="cs-canvas-surface"
        :style="
          canvas
            ? {
                width: `${canvas.width * ((zoom ?? 100) / 100)}px`,
                height: `${canvas.height * ((zoom ?? 100) / 100)}px`,
              }
            : undefined
        "
      >
        <canvas
          ref="scene"
          class="cs-canvas"
          :aria-label="t('sceneCanvas')"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="finishGesture"
          @pointercancel="finishGesture"
          @lostpointercapture="finishGesture"
          @dblclick="onDoubleClick"
          @wheel="onWheel"
        ></canvas>
        <canvas
          ref="overlay"
          class="cs-canvas cs-canvas-overlay"
          :aria-label="t('interactionOverlay')"
        ></canvas>
        <section v-if="rendererError" class="cs-empty-state" role="alert">
          <h1>{{ rendererError }}</h1>
          <button type="button" class="cs-button" @click="retryRender">
            {{ t('retry') }}
          </button>
        </section>
        <section
          v-else-if="documentState.kind === 'empty'"
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
        <p v-else class="cs-canvas-ready" aria-live="polite">
          {{ documentState.title }} · {{ documentState.dimensions }}
        </p>
      </div>
    </div>
  </main>
</template>
