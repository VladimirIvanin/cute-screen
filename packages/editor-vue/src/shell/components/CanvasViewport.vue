<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { UiIcon } from '../icon'
import type { CanvasViewportHosts, ShellDocumentState } from '../types'
import {
  Canvas2DRenderer,
  createDocumentRenderScene,
  drawNodes2D,
  hitTestDocument,
  hitTestDocumentAll,
  snapPoint,
  type EditorDocumentV1,
  type ImageLayer,
  type LayerNode,
  type SnapCandidate,
  type Transform2D,
  type ImageResource,
  type SrgbColor,
  type ShadowStyle,
  createDrawingLayer,
  arrowSelectionHandles,
  updateArrowHandle,
  createTextLayer,
  createTextCommitCommand,
  createNumberedMarkerLayer,
  createCalloutLayer,
  type DrawingDefaults,
  type DrawingTool,
  type ArrowHandleKind,
  type FontReference,
  type CalloutLayer,
  type BlendMode,
  type NumberedMarkerLayer,
  type TextLayer,
  type TextBackground,
} from '@cute-screen/editor-renderer'

export interface TextToolDefaults {
  readonly font: FontReference
  readonly fontSize: number
  readonly weight: FontReference['weight']
  readonly italic: boolean
  readonly underline: boolean
  readonly letterSpacing: number
  readonly alignment: 'start' | 'center' | 'end' | 'justify'
  readonly lineHeight: number
  readonly color: SrgbColor
  readonly fill: TextLayer['payload']['fill']
  readonly outline: TextLayer['payload']['outline']
  readonly background: TextBackground | null
  readonly opacity: number
  readonly blendMode: BlendMode
  readonly shadows: readonly ShadowStyle[]
}

type EditableTextLayer = TextLayer | CalloutLayer | NumberedMarkerLayer

const props = defineProps<{
  documentState: ShellDocumentState
  canvas?: { readonly width: number; readonly height: number } | undefined
  image?: HTMLImageElement | undefined
  textureImages?: ReadonlyMap<string, HTMLImageElement> | undefined
  imageLayer?: ImageLayer | undefined
  document?: EditorDocumentV1 | undefined
  selectedLayerId?: string | undefined
  selectedLayerIds?: readonly string[] | undefined
  activeTool?: string | undefined
  sampling?: boolean | undefined
  drawingDefaults?: DrawingDefaults | undefined
  textDefaults?: TextToolDefaults | undefined
  textStyleRevision?: number | undefined
  nextMarkerSequence?: number | undefined
  markerShape?: 'circle' | 'square' | 'diamond' | 'star' | undefined
  openImageAvailable?: boolean | undefined
  zoom?: number | undefined
  fitMode?: boolean | undefined
  t: (
    key:
      | 'canvasViewport'
      | 'sceneCanvas'
      | 'interactionOverlay'
      | 'emptyTitle'
      | 'emptyDescription'
      | 'openImage'
      | 'loadingEditor'
      | 'retry',
  ) => string
}>()
const emit = defineEmits<{
  hostsReady: [hosts: CanvasViewportHosts]
  selectLayer: [id: string, toggle: boolean]
  moveLayer: [id: string, deltaX: number, deltaY: number]
  transformLayer: [id: string, transform: Transform2D]
  updateLayerPayload: [
    id: string,
    payload: import('@cute-screen/editor-renderer').JsonObject,
  ]
  addLayer: [layer: LayerNode]
  documentCommand: [command: unknown]
  textEditing: [
    draft:
      { readonly id: string; readonly kind: 'text' | 'callout' } | undefined,
  ]
  requestImageImport: [origin: { readonly x: number; readonly y: number }]
  openImage: []
  selectTool: [id: 'select']
  zoom: [value: number]
  fitZoom: [value: number]
  retry: []
  colorSample: [value: string]
  colorSampleError: [message: string]
  colorSampleCancel: []
}>()
const scene = ref<HTMLCanvasElement>()
const overlay = ref<HTMLCanvasElement>()
const textEditor = ref<HTMLDivElement>()
const scrollContainer = ref<HTMLDivElement>()
const rendererError = ref<string>()
const samplingCursor = ref<CanvasPoint>()
const editingText = ref<
  | {
      readonly origin: CanvasPoint
      readonly width: number
      readonly fixedWidth: boolean
      readonly id: string
      value: string
      composing: boolean
      style: TextToolDefaults
      readonly kind: 'text' | 'callout'
      readonly existing?: EditableTextLayer
    }
  | undefined
>()
let renderer: Canvas2DRenderer | undefined
let imageResources = new Map<
  string,
  { readonly key: string; readonly resource: ImageResource }
>()
let resizeObserver: ResizeObserver | undefined
let lastFitZoom: number | undefined
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
  | {
      readonly kind: 'arrowHandle'
      readonly id: string
      readonly handle: ArrowHandleKind
      readonly start: { x: number; y: number }
      readonly current: { x: number; y: number }
    }
  | {
      readonly kind: 'draw'
      readonly tool: DrawingTool
      readonly start: CanvasPoint
      readonly current: CanvasPoint
      readonly constrainAngle: boolean
      readonly drawFromCenter: boolean
      readonly points: readonly CanvasPoint[]
    }
  | {
      readonly kind: 'text'
      readonly start: CanvasPoint
      readonly current: CanvasPoint
    }
  | undefined

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type CanvasPoint = {
  readonly x: number
  readonly y: number
  readonly pressure?: number
}
const DEFAULT_TEXT_FONT: FontReference = Object.freeze({
  source: 'bundled',
  family: 'Roboto',
  weight: 400,
  style: 'normal',
})
const DEFAULT_TEXT_TOOL: TextToolDefaults = Object.freeze({
  font: DEFAULT_TEXT_FONT,
  fontSize: 16,
  weight: 400,
  italic: false,
  underline: false,
  letterSpacing: 0,
  alignment: 'start',
  lineHeight: 1.25,
  color: { red: 0, green: 0, blue: 0, alpha: 1 },
  fill: {
    kind: 'solid' as const,
    color: { red: 0, green: 0, blue: 0, alpha: 1 },
    opacity: 1,
  },
  outline: null,
  background: null,
  opacity: 1,
  blendMode: 'normal',
  shadows: [],
})
function cssTextColor(color: SrgbColor): string {
  return `rgba(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)}, ${color.alpha})`
}
function cssTextBackground(
  background: TextBackground | null,
): string | undefined {
  const fill = background?.fill as
    | {
        readonly kind?: unknown
        readonly color?: unknown
      }
    | undefined
  if (fill?.kind !== 'solid' || !fill.color || typeof fill.color !== 'object')
    return undefined
  const color = fill.color as Partial<SrgbColor>
  if (
    ![color.red, color.green, color.blue, color.alpha].every(
      (channel) => typeof channel === 'number' && Number.isFinite(channel),
    )
  ) {
    return undefined
  }
  return cssTextColor(color as SrgbColor)
}
const editorTextStyle = computed(() => {
  return editingText.value?.style ?? props.textDefaults ?? DEFAULT_TEXT_TOOL
})
function copyTextStyle(value: TextToolDefaults): TextToolDefaults {
  // Props may be Vue proxies; structuredClone deliberately rejects them.
  return JSON.parse(JSON.stringify(value)) as TextToolDefaults
}
function styleForSession(
  existing: EditableTextLayer | undefined,
): TextToolDefaults {
  const defaults = props.textDefaults ?? DEFAULT_TEXT_TOOL
  if (!existing) return copyTextStyle(defaults)
  const content =
    existing.kind === 'numberedMarker'
      ? existing.payload.label
      : existing.payload.content
  const span = content.spans[0]
  const paragraph = content.paragraphs[0]
  return {
    ...copyTextStyle(defaults),
    font:
      existing.kind === 'numberedMarker'
        ? defaults.font
        : existing.payload.font,
    fontSize: span?.fontSize ?? defaults.fontSize,
    weight: span?.weight ?? defaults.weight,
    italic: span?.italic ?? defaults.italic,
    underline: span?.underline ?? defaults.underline,
    letterSpacing: span?.letterSpacing ?? defaults.letterSpacing,
    alignment: paragraph?.alignment ?? defaults.alignment,
    lineHeight: paragraph?.lineHeight ?? defaults.lineHeight,
    ...(existing.kind === 'text'
      ? {
          fill: existing.payload.fill,
          outline: existing.payload.outline,
          background: existing.payload.background,
          opacity: existing.opacity,
          blendMode: existing.blendMode ?? 'normal',
          shadows: existing.shadows ?? [],
        }
      : {}),
  }
}
watch(
  () => props.textStyleRevision,
  () => {
    if (!editingText.value) return
    editingText.value.style = copyTextStyle(
      props.textDefaults ?? DEFAULT_TEXT_TOOL,
    )
  },
)
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
    const imageInputs = new Map<string, HTMLImageElement>([
      [layer.payload.blobHash, props.image],
      ...(props.textureImages ?? new Map()),
    ])
    for (const [id, image] of imageInputs) {
      const key = `${id}:${image.currentSrc || image.src}`
      if (imageResources.get(id)?.key === key) continue
      imageResources.get(id)?.resource.dispose()
      const resource = await runtime.createImageResource({
        id,
        width: image.naturalWidth,
        height: image.naturalHeight,
        source: image,
      })
      imageResources.set(id, { key, resource })
    }
    for (const [id, resource] of imageResources) {
      if (imageInputs.has(id)) continue
      resource.resource.dispose()
      imageResources.delete(id)
    }
    runtime.setScene(createDocumentRenderScene(props.document))
    runtime.render(['scene'])
  } catch (error) {
    renderer?.dispose()
    renderer = undefined
    imageResources = new Map()
    rendererError.value = error instanceof Error ? error.message : String(error)
  }
  invalidateOverlay()
}
function fitCanvas(): void {
  const container = scrollContainer.value
  const canvas = props.canvas
  if (!props.fitMode) {
    lastFitZoom = undefined
    return
  }
  if (!container || !canvas) return
  const style = window.getComputedStyle(container)
  const inset = (value: string): number => {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const availableWidth =
    container.clientWidth - inset(style.paddingLeft) - inset(style.paddingRight)
  const availableHeight =
    container.clientHeight -
    inset(style.paddingTop) -
    inset(style.paddingBottom)
  if (availableWidth <= 0 || availableHeight <= 0) return
  const scale = Math.min(
    availableWidth / canvas.width,
    availableHeight / canvas.height,
  )
  const nextZoom = Math.round(scale * 100)
  if (nextZoom === props.zoom || nextZoom === lastFitZoom) return
  lastFitZoom = nextZoom
  emit('fitZoom', nextZoom)
}
defineExpose({ refitCanvas: fitCanvas })
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
  if (
    !gesture ||
    gesture.kind === 'pan' ||
    gesture.kind === 'draw' ||
    gesture.kind === 'text' ||
    gesture.id !== layer.id
  ) {
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
function drawDraft(context: CanvasRenderingContext2D): void {
  if (!gesture || gesture.kind !== 'draw') return
  const layer = createDrawingLayer({
    id: '__drawing-draft__',
    tool: gesture.tool,
    start: gesture.start,
    end: gesture.current,
    ...(props.drawingDefaults === undefined
      ? {}
      : { defaults: props.drawingDefaults }),
    constrainAngle: gesture.constrainAngle,
    drawFromCenter: gesture.drawFromCenter,
    points: gesture.points,
  })
  if (!layer || !props.document) return
  drawNodes2D(
    context,
    createDocumentRenderScene({ ...props.document, layers: [layer] }).nodes,
  )
}
function drawOverlay(): void {
  if (!overlay.value || !props.canvas) return
  const context = overlay.value.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, overlay.value.width, overlay.value.height)
  drawDraft(context)
  if (props.sampling && samplingCursor.value) {
    const point = samplingCursor.value
    context.save()
    context.strokeStyle = '#fff'
    context.lineWidth = 1 / ((props.zoom ?? 100) / 100)
    context.beginPath()
    context.arc(
      point.x,
      point.y,
      7 / ((props.zoom ?? 100) / 100),
      0,
      Math.PI * 2,
    )
    context.stroke()
    context.restore()
  }
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
  if (layer.kind === 'arrow') {
    for (const { kind: name, point: saved } of arrowSelectionHandles(layer)) {
      const local =
        gesture?.kind === 'arrowHandle' &&
        gesture.id === layer.id &&
        gesture.handle === name
          ? toLocal(layer, gesture.current)
          : saved
      const position = transformPoint(transform, local)
      context.beginPath()
      context.arc(position.x, position.y, handleHalfSize + 2, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    }
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
  () => [
    props.canvas,
    props.image,
    props.imageLayer,
    props.document,
    props.textureImages,
  ],
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
  readonly pressure?: number
  readonly pointerType?: string
}): CanvasPoint | undefined {
  if (!scene.value || !props.document) return undefined
  const rect = scene.value.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return undefined
  return {
    x: ((event.clientX - rect.left) * scene.value.width) / rect.width,
    y: ((event.clientY - rect.top) * scene.value.height) / rect.height,
    pressure:
      event.pointerType === 'pen' &&
      typeof event.pressure === 'number' &&
      Number.isFinite(event.pressure)
        ? Math.max(0, Math.min(1, event.pressure))
        : 0.5,
  }
}
function sampleScene(point: CanvasPoint): void {
  const canvas = scene.value
  if (!canvas)
    return emit(
      'colorSampleError',
      samplingError(
        'Canvas is unavailable for colour sampling',
        'Холст недоступен для выбора цвета',
      ),
    )
  const x = Math.max(0, Math.min(canvas.width - 1, Math.round(point.x)))
  const y = Math.max(0, Math.min(canvas.height - 1, Math.round(point.y)))
  try {
    const data = canvas.getContext('2d')?.getImageData(x, y, 1, 1).data
    if (!data || data[3] === 0) {
      emit(
        'colorSampleError',
        samplingError(
          'There is no opaque colour at this point',
          'В этой точке нет непрозрачного цвета',
        ),
      )
      return
    }
    const hex = `#${[data[0], data[1], data[2]]
      .map((channel) => (channel ?? 0).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}`
    emit('colorSample', hex)
  } catch (error) {
    console.warn('cute-screen scene colour sampling failed', error)
    emit(
      'colorSampleError',
      samplingError(
        'The canvas colour could not be read',
        'Не удалось прочитать цвет с холста',
      ),
    )
  }
}
function samplingError(english: string, russian: string): string {
  return document.documentElement.lang === 'ru' ? russian : english
}
function visibleCanvasCenter(): CanvasPoint | undefined {
  const container = scrollContainer.value
  if (!container) return undefined
  const viewport = container.getBoundingClientRect()
  return canvasPoint({
    clientX: viewport.left + viewport.width / 2,
    clientY: viewport.top + viewport.height / 2,
  })
}
function initialSamplingCursor(): CanvasPoint | undefined {
  if (!props.canvas) return undefined
  return (
    visibleCanvasCenter() ?? {
      x: Math.max(0, (props.canvas.width - 1) / 2),
      y: Math.max(0, (props.canvas.height - 1) / 2),
    }
  )
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
function arrowHandleAtPoint(
  layer: LayerNode,
  point: CanvasPoint,
): ArrowHandleKind | undefined {
  if (layer.kind !== 'arrow') return undefined
  const tolerance = 9 / ((props.zoom ?? 100) / 100)
  return arrowSelectionHandles(layer).find(({ point: local }) => {
    const candidate = transformPoint(layer.transform, local)
    return Math.hypot(candidate.x - point.x, candidate.y - point.y) <= tolerance
  })?.kind
}
function onPointerDown(event: PointerEvent): void {
  // A canvas click is the direct confirmation gesture for the transient text
  // editor. Commit it before starting another canvas gesture so the next text
  // session cannot replace this one while its blur handler is still pending.
  if (editingText.value) {
    if (event.button === 0 && !editingText.value.composing) {
      event.preventDefault()
      commitTextEditor()
    }
    return
  }
  const point = canvasPoint(event)
  if (!point || !scene.value || !props.document) return
  if (props.sampling) {
    event.preventDefault()
    samplingCursor.value = point
    sampleScene(point)
    return
  }
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
  if (props.activeTool === 'image') {
    event.preventDefault()
    const center = visibleCanvasCenter() ?? point
    emit('requestImageImport', { x: center.x, y: center.y })
    return
  }
  if (props.activeTool === 'numberedMarker') {
    event.preventDefault()
    const sequence = props.nextMarkerSequence ?? 1
    emit(
      'addLayer',
      createNumberedMarkerLayer({
        id: crypto.randomUUID(),
        sequence,
        origin: point,
        shape: props.markerShape ?? 'circle',
      }),
    )
    return
  }
  if (props.activeTool === 'callout') {
    event.preventDefault()
    startTextEditor({ origin: point, kind: 'callout' })
    return
  }
  if (props.activeTool === 'text') {
    event.preventDefault()
    const text = props.document.layers.find(
      (layer) =>
        layer.id === hitTestDocument(props.document!, point)?.nodeId &&
        (layer.kind === 'text' ||
          layer.kind === 'callout' ||
          layer.kind === 'numberedMarker'),
    )
    if (
      text?.kind === 'text' ||
      text?.kind === 'callout' ||
      text?.kind === 'numberedMarker'
    ) {
      const bounds = layerBounds(text)
      startTextEditor({
        origin: {
          x: text.transform.translateX + bounds.x,
          y: text.transform.translateY + bounds.y,
        },
        existing: text,
      })
    } else {
      scene.value.setPointerCapture(event.pointerId)
      gesture = { kind: 'text', start: point, current: point }
    }
    return
  }
  if (
    props.activeTool === 'arrow' ||
    props.activeTool === 'shape' ||
    props.activeTool === 'pencil' ||
    props.activeTool === 'marker'
  ) {
    event.preventDefault()
    scene.value.setPointerCapture(event.pointerId)
    gesture = {
      kind: 'draw',
      tool: props.activeTool,
      start: point,
      current: point,
      constrainAngle: event.shiftKey,
      drawFromCenter: event.altKey,
      points: [point],
    }
    invalidateOverlay()
    return
  }
  const selected = selectedLayer()
  const arrowHandle =
    selected && !selected.locked
      ? arrowHandleAtPoint(selected, point)
      : undefined
  if (selected && arrowHandle) {
    scene.value.setPointerCapture(event.pointerId)
    gesture = {
      kind: 'arrowHandle',
      id: selected.id,
      handle: arrowHandle,
      start: point,
      current: point,
    }
    return
  }
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
function startTextEditor(input: {
  readonly origin: CanvasPoint
  readonly existing?: EditableTextLayer
  readonly kind?: 'text' | 'callout'
  readonly width?: number
  readonly fixedWidth?: boolean
}): void {
  const bounds = input.existing ? layerBounds(input.existing) : undefined
  editingText.value = {
    id: input.existing?.id ?? crypto.randomUUID(),
    origin: input.origin,
    width:
      input.width ??
      bounds?.width ??
      Math.max(160, props.canvas?.width ? props.canvas.width / 3 : 160),
    fixedWidth:
      input.fixedWidth ??
      (input.existing?.kind === 'text'
        ? input.existing.payload.content.wrap === 'fixedWidth'
        : false),
    value:
      input.existing?.kind === 'numberedMarker'
        ? input.existing.payload.label.text
        : (input.existing?.payload.content.text ?? ''),
    composing: false,
    style: styleForSession(input.existing),
    kind: input.kind ?? 'text',
    ...(input.existing === undefined ? {} : { existing: input.existing }),
  }
  emit('textEditing', {
    id: editingText.value.id,
    kind: editingText.value.kind,
  })
  void nextTick(() => {
    const editor = textEditor.value
    if (!editor || !editingText.value) return
    // The DOM is a short-lived editing projection. The document continues to
    // store only plain Unicode and typed ranges, never HTML.
    editor.textContent = editingText.value.value
    editor.focus()
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
}
function readEditorText(): string {
  const editor = textEditor.value
  if (!editor) return editingText.value?.value ?? ''
  // innerText preserves the visual paragraph boundaries produced by Enter.
  return (editor.innerText || editor.textContent || '').replace(/\r\n?/gu, '\n')
}
function onTextEditorInput(): void {
  const editing = editingText.value
  if (!editing) return
  editing.value = readEditorText()
}
function onTextEditorCompositionEnd(): void {
  if (editingText.value) editingText.value.composing = false
  onTextEditorInput()
}
function onTextEditorPaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text/plain')
  if (text === undefined) return
  event.preventDefault()
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined
  if (!range) return
  range.deleteContents()
  const node = document.createTextNode(text.replace(/\r\n?/gu, '\n'))
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
  onTextEditorInput()
}
function onTextEditorBlur(): void {
  // A toolbar click belongs to the active editing session, not to the canvas.
  window.setTimeout(() => {
    if (!editingText.value) return
    const active = document.activeElement
    if (
      active instanceof HTMLElement &&
      active.closest('.cs-context-toolbar')
    ) {
      textEditor.value?.focus()
      return
    }
    commitTextEditor()
  }, 0)
}
function commitTextEditor(): void {
  const editing = editingText.value
  if (!editing || editing.composing) return
  editingText.value = undefined
  emit('textEditing', undefined)
  const defaults = props.textDefaults ?? DEFAULT_TEXT_TOOL
  const style = editing.style
  const existing = editing.existing
  if (existing?.kind === 'callout' || existing?.kind === 'numberedMarker') {
    const draft = createTextLayer({
      id: existing.id,
      text: editing.value,
      origin: {
        x: existing.transform.translateX,
        y: existing.transform.translateY,
      },
      font: existing.kind === 'callout' ? style.font : defaults.font,
      fontSize: style.fontSize,
      underline: style.underline,
      letterSpacing: style.letterSpacing,
      fixedWidth: layerBounds(existing).width,
      color: style.color,
    })
    if (!draft) return
    const next: EditableTextLayer =
      existing.kind === 'callout'
        ? {
            ...existing,
            payload: { ...existing.payload, content: draft.payload.content },
          }
        : {
            ...existing,
            payload: { ...existing.payload, label: draft.payload.content },
          }
    emit('documentCommand', {
      type: 'updateLayer',
      before: existing,
      after: next,
    })
    return
  }
  if (editing.kind === 'callout') {
    const layer = createCalloutLayer({
      id: editing.id,
      text: editing.value,
      origin: editing.origin,
      tailAnchor: {
        x: editing.width / 2,
        y: style.fontSize * style.lineHeight + 40,
      },
      font: style.font,
    })
    if (layer) emit('addLayer', layer)
    return
  }
  const draft = createTextLayer({
    id: editing.id,
    text: editing.value,
    origin: editing.existing
      ? {
          x: editing.existing.transform.translateX,
          y: editing.existing.transform.translateY,
        }
      : editing.origin,
    font: style.font,
    fontSize: style.fontSize,
    weight: style.weight,
    italic: style.italic,
    underline: style.underline,
    letterSpacing: style.letterSpacing,
    alignment: style.alignment,
    lineHeight: style.lineHeight,
    ...(editing.fixedWidth ? { fixedWidth: editing.width } : {}),
    color: style.color,
    fill: style.fill,
    outline: style.outline,
    background: style.background,
    opacity: style.opacity,
    blendMode: style.blendMode,
    shadows: style.shadows,
  })
  if (!draft) {
    if (!existing) return
    const index = props.document?.layers.findIndex(
      (layer) => layer.id === existing.id,
    )
    if (index === undefined || index < 0) return
    emit(
      'documentCommand',
      createTextCommitCommand({
        existing,
        next: null,
        index,
      }),
    )
    return
  }
  if (!existing) {
    emit('documentCommand', createTextCommitCommand({ next: draft }))
    return
  }
  const next: TextLayer = {
    ...draft,
    id: existing.id,
    transform: existing.transform,
    opacity: draft.opacity,
    blendMode: draft.blendMode ?? 'normal',
    shadows: draft.shadows ?? [],
    payload: {
      ...draft.payload,
      content: draft.payload.content,
    },
  }
  emit('documentCommand', createTextCommitCommand({ existing, next }))
}
function cancelTextEditor(): void {
  editingText.value = undefined
  emit('textEditing', undefined)
}
function onTextEditorKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancelTextEditor()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    commitTextEditor()
  }
}
function onDoubleClick(event: MouseEvent): void {
  const point = canvasPoint(event)
  if (!point || !props.document) return
  const hits = hitTestDocumentAll(props.document, point)
  const text = props.document.layers.find(
    (layer) =>
      layer.id === hits[0]?.nodeId &&
      (layer.kind === 'text' ||
        layer.kind === 'callout' ||
        layer.kind === 'numberedMarker'),
  )
  if (
    text?.kind === 'text' ||
    text?.kind === 'callout' ||
    text?.kind === 'numberedMarker'
  ) {
    event.preventDefault()
    const bounds = layerBounds(text)
    startTextEditor({
      origin: {
        x: text.transform.translateX + bounds.x,
        y: text.transform.translateY + bounds.y,
      },
      existing: text,
      kind: 'text',
    })
    return
  }
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
    return
  }
  if (gesture.kind === 'arrowHandle') {
    gesture = { ...gesture, current: point }
    invalidateOverlay()
    return
  }
  if (gesture.kind === 'draw') {
    const coalesced = event.getCoalescedEvents?.() ?? [event]
    const samples: CanvasPoint[] = []
    if (gesture.tool === 'pencil' || gesture.tool === 'marker') {
      let previous = gesture.points[gesture.points.length - 1]
      for (const sample of coalesced) {
        const candidate = canvasPoint(sample)
        if (
          candidate &&
          (!previous ||
            Math.hypot(candidate.x - previous.x, candidate.y - previous.y) >=
              0.5)
        ) {
          samples.push(candidate)
          previous = candidate
        }
      }
    }
    gesture = {
      ...gesture,
      current: point,
      constrainAngle: event.shiftKey,
      drawFromCenter: event.altKey,
      points:
        samples.length > 0 ? [...gesture.points, ...samples] : gesture.points,
    }
    invalidateOverlay()
    return
  }
  if (gesture.kind === 'text') {
    gesture = { ...gesture, current: point }
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
  if (completed?.kind === 'arrowHandle') {
    const layer = props.document?.layers.find(
      (candidate) => candidate.id === completed.id,
    )
    if (
      layer?.kind === 'arrow' &&
      (completed.current.x !== completed.start.x ||
        completed.current.y !== completed.start.y)
    ) {
      const after = updateArrowHandle(
        layer,
        completed.handle,
        toLocal(layer, completed.current),
      )
      emit('documentCommand', {
        type: 'updateLayer',
        before: layer,
        after,
      })
    }
  }
  if (completed?.kind === 'draw') {
    const layer = createDrawingLayer({
      id: crypto.randomUUID(),
      tool: completed.tool,
      start: completed.start,
      end: completed.current,
      ...(props.drawingDefaults === undefined
        ? {}
        : { defaults: props.drawingDefaults }),
      constrainAngle: completed.constrainAngle,
      drawFromCenter: completed.drawFromCenter,
      points: completed.points,
    })
    if (layer) emit('addLayer', layer)
  }
  if (completed?.kind === 'text') {
    const width = Math.abs(completed.current.x - completed.start.x)
    const fixedWidth = width >= 4
    startTextEditor({
      origin: fixedWidth
        ? {
            x: Math.min(completed.start.x, completed.current.x),
            y: Math.min(completed.start.y, completed.current.y),
          }
        : completed.start,
      ...(fixedWidth ? { width, fixedWidth: true } : {}),
    })
  }
  invalidateOverlay()
}
function cancelGesture(event?: PointerEvent): void {
  gesture = undefined
  if (event && scene.value?.hasPointerCapture(event.pointerId)) {
    scene.value.releasePointerCapture(event.pointerId)
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
  if (props.sampling && scene.value && props.canvas) {
    const initial = samplingCursor.value ??
      initialSamplingCursor() ?? { x: 0, y: 0 }
    const step = event.shiftKey ? 10 : 1
    const moves: Record<string, readonly [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      sampleScene(initial)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      samplingCursor.value = undefined
      emit('colorSampleCancel')
      return
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      samplingCursor.value = {
        x: Math.max(0, Math.min(props.canvas.width - 1, initial.x + move[0])),
        y: Math.max(0, Math.min(props.canvas.height - 1, initial.y + move[1])),
      }
      invalidateOverlay()
      return
    }
  }
  if (
    event.code === 'Space' &&
    !(event.target instanceof HTMLInputElement) &&
    !(event.target instanceof HTMLTextAreaElement) &&
    !(event.target instanceof HTMLElement && event.target.isContentEditable)
  ) {
    spacePressed = true
  }
  if (event.key === 'Escape') {
    if (editingText.value) {
      cancelTextEditor()
      return
    }
    if (gesture?.kind === 'draw') {
      cancelGesture()
    } else if (
      props.activeTool === 'arrow' ||
      props.activeTool === 'shape' ||
      props.activeTool === 'pencil' ||
      props.activeTool === 'marker'
    ) {
      emit('selectTool', 'select')
    }
  }
}
watch(
  () => props.sampling,
  (sampling) => {
    if (!sampling) {
      samplingCursor.value = undefined
      invalidateOverlay()
      return
    }
    samplingCursor.value = initialSamplingCursor()
    invalidateOverlay()
    void nextTick(() => scene.value?.focus({ preventScroll: true }))
  },
)
function onWindowKeyup(event: KeyboardEvent): void {
  if (event.code === 'Space') spacePressed = false
  if (event.key === 'Alt' && gesture?.kind === 'move') {
    gesture = { ...gesture, guidesVisible: false }
    invalidateOverlay()
  }
}
function onWindowBlur(): void {
  spacePressed = false
  cancelGesture()
}
onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('keyup', onWindowKeyup)
  window.addEventListener('blur', onWindowBlur)
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = undefined
  for (const { resource } of imageResources.values()) resource.dispose()
  imageResources.clear()
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
      <div class="cs-canvas-stage">
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
            :tabindex="sampling ? 0 : -1"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="finishGesture"
            @pointercancel="cancelGesture"
            @lostpointercapture="cancelGesture"
            @dblclick="onDoubleClick"
            @wheel="onWheel"
          ></canvas>
          <div
            v-if="editingText"
            ref="textEditor"
            class="cs-text-editor"
            contenteditable="true"
            spellcheck="true"
            role="textbox"
            aria-multiline="true"
            :style="{
              left: `${editingText.origin.x * ((zoom ?? 100) / 100)}px`,
              top: `${editingText.origin.y * ((zoom ?? 100) / 100)}px`,
              width: `${editingText.width * ((zoom ?? 100) / 100)}px`,
              fontSize: `${editorTextStyle.fontSize * ((zoom ?? 100) / 100)}px`,
              lineHeight: String(editorTextStyle.lineHeight),
              fontFamily: editorTextStyle.font.family,
              fontWeight: String(editorTextStyle.weight),
              fontStyle: editorTextStyle.italic ? 'italic' : 'normal',
              textDecoration: editorTextStyle.underline ? 'underline' : 'none',
              letterSpacing: `${editorTextStyle.letterSpacing * ((zoom ?? 100) / 100)}px`,
              color: cssTextColor(editorTextStyle.color),
              backgroundColor: cssTextBackground(editorTextStyle.background),
              borderRadius: editorTextStyle.background
                ? `${editorTextStyle.background.radius * ((zoom ?? 100) / 100)}px`
                : undefined,
            }"
            :aria-label="
              editingText.kind === 'callout' ? 'Callout editor' : 'Text editor'
            "
            @compositionstart="editingText.composing = true"
            @compositionend="onTextEditorCompositionEnd"
            @input="onTextEditorInput"
            @paste="onTextEditorPaste"
            @keydown="onTextEditorKeydown"
            @blur="onTextEditorBlur"
          ></div>
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
            <button
              v-if="openImageAvailable"
              type="button"
              class="cs-button"
              @click="emit('openImage')"
            >
              <UiIcon name="image" />{{ t('openImage') }}
            </button>
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
    </div>
  </main>
</template>
