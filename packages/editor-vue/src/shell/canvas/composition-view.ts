import {
  computed,
  ref,
  shallowRef,
  watch,
} from 'vue'
import {
  DEFAULT_PRESENTATION_SETTINGS,
  resolveCompositionLayout,
  compositionInteractionSpace,
  type CompositionLayout,
  type EditorDocumentV1,
  type LayerNode,
} from '@cute-screen/editor-renderer'
import type {
  CanvasViewportProps,
  CanvasViewportEmit,
  ViewportOutputBounds,
} from './contracts'

function compositionActive(
  doc: EditorDocumentV1 | undefined,
  props: CanvasViewportProps,
): boolean {
  return Boolean(doc?.presentation.composition && props.activeTool !== 'crop' && !props.quickFrameMode)
}

function projectView(
  doc: EditorDocumentV1,
  space: 'content' | 'card',
  active: boolean,
): EditorDocumentV1 {
  if (!doc.presentation.composition) {
    if (doc.layers.every((layer) => layer.space !== 'card')) return doc
    return { ...doc, layers: doc.layers.filter((layer) => layer.space !== 'card') }
  }
  const viewingCard = space === 'card' && active
  const l = resolveCompositionLayout(doc)
  return {
    ...doc,
    presentation: DEFAULT_PRESENTATION_SETTINGS,
    canvas: viewingCard ? { width: l.width, height: l.height } : doc.canvas,
    crop: viewingCard ? null : doc.crop,
    layers: doc.layers.filter((layer) => (layer.space === 'card') === viewingCard),
  }
}

function layoutBounds(
  layout: CompositionLayout,
  card: boolean,
): ViewportOutputBounds {
  return card
    ? { x: 0, y: 0, width: layout.width, height: layout.height }
    : {
        x: layout.source.x - layout.content.x / layout.scale,
        y: layout.source.y - layout.content.y / layout.scale,
        width: layout.width / layout.scale,
        height: layout.height / layout.scale,
      }
}

function sameBounds(
  left: ViewportOutputBounds | undefined,
  right: ViewportOutputBounds | undefined,
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
}

const missingPreviewProp = Symbol('missing-preview-prop')

interface PaintedFrame {
  full: EditorDocumentV1 | undefined
  view: EditorDocumentV1 | undefined
  active: boolean
}

interface PreviewRead {
  readonly props: CanvasViewportProps
  readonly painted: PaintedFrame
  readonly committedView: () => EditorDocumentV1 | undefined
  readonly bounds: () => ViewportOutputBounds | undefined
  readonly previewBounds: () => ViewportOutputBounds | undefined
  readonly previewScale: () => number | undefined
  readonly contentScale: () => number
  readonly space: () => 'content' | 'card'
  readonly compositionEnabled: () => boolean
  readonly activateAt: (
    event: MouseEvent,
    preserveSelection?: boolean,
  ) => void
}

function scenePreviewValue(
  key: string | symbol,
  read: PreviewRead,
): unknown {
  const { props, painted } = read
  if (key === 'document') return painted.view ?? read.committedView()
  if (key === 'exportDocument') return props.exportDocument ?? props.document
  if (key === 'compositionDocument') {
    const full = painted.full ?? props.document
    return compositionActive(full, props) ? full : undefined
  }
  if (key === 'canvas') {
    return (painted.view ?? read.committedView())?.canvas ?? props.canvas
  }
  if (key === 'interactivePreview') {
    return Boolean(props.interactivePreview || painted.active)
  }
  return missingPreviewProp
}

function framePreviewValue(
  key: string | symbol,
  read: PreviewRead,
): unknown {
  const { props } = read
  if (key === 'compositionBounds') return read.bounds()
  if (key === 'previewBounds') return read.previewBounds()
  if (key === 'previewZoomScale') return read.previewScale()
  if (key === 'zoom') {
    return (props.zoom ?? 100) * (read.previewScale() ?? read.contentScale())
  }
  if (key === 'compositionSpace') return read.space()
  if (key === 'activateCompositionAt') {
    return read.compositionEnabled() ? read.activateAt : undefined
  }
  return missingPreviewProp
}

function previewProp(
  target: CanvasViewportProps,
  key: string | symbol,
  read: PreviewRead,
): unknown {
  const scene = scenePreviewValue(key, read)
  if (scene !== missingPreviewProp) return scene
  const frame = framePreviewValue(key, read)
  if (frame !== missingPreviewProp) return frame
  return Reflect.get(target, key)
}

function paintPreview(
  props: CanvasViewportProps,
  space: 'content' | 'card',
  painted: PaintedFrame,
): EditorDocumentV1 | undefined {
  const numeric = props.scenePreview?.numeric.value
  const composition = props.scenePreview?.composition.value
  const active = Boolean(numeric || composition)
  const base = numeric ?? props.document
  const full = base && composition
    ? { ...base, presentation: { ...base.presentation, composition } }
    : active
      ? base
      : undefined
  painted.full = full
  painted.view = full
    ? projectView(full, space, compositionActive(full, props))
    : undefined
  painted.active = active
  return full
}

function syncPaintedLayout(
  full: EditorDocumentV1 | undefined,
  props: CanvasViewportProps,
  card: boolean,
  committedBounds: ViewportOutputBounds | undefined,
  committedScale: number,
  paintedBounds: { value: ViewportOutputBounds | undefined },
  paintedScale: { value: number | undefined },
): void {
  const active = full ? compositionActive(full, props) : false
  const previewLayout = full?.presentation.composition
    ? resolveCompositionLayout(full)
    : undefined
  const nextBounds = previewLayout && active
    ? layoutBounds(previewLayout, card)
    : undefined
  if (!sameBounds(nextBounds, committedBounds)) {
    if (!sameBounds(paintedBounds.value, nextBounds)) paintedBounds.value = nextBounds
  } else if (paintedBounds.value) paintedBounds.value = undefined
  const nextScale = previewLayout && active && !card
    ? previewLayout.scale
    : undefined
  if (nextScale !== undefined && nextScale !== committedScale) {
    if (paintedScale.value !== nextScale) paintedScale.value = nextScale
  } else if (paintedScale.value !== undefined) paintedScale.value = undefined
}

function activateComposition(
  props: CanvasViewportProps,
  enabled: () => boolean,
  space: { value: 'content' | 'card' },
  layout: () => CompositionLayout | undefined,
  emit: CanvasViewportEmit,
): (
  event: MouseEvent,
  preserveSelection?: boolean,
) => void {
  return (
    event,
    preserveSelection = false,
  ) => {
    if (
      !enabled() ||
      !props.document ||
      props.sampling ||
      props.activeTool === 'hand'
    ) return
    const canvas = event.currentTarget as HTMLCanvasElement | null
    const rect = canvas?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return
    const current = layout()
    if (!current) return
    const point = {
      x: (event.clientX - rect.left) * current.width / rect.width,
      y: (event.clientY - rect.top) * current.height / rect.height,
    }
    const next = compositionInteractionSpace(
      props.document,
      point,
      {
        selecting: props.activeTool === 'select',
        preserveSelection,
        currentSpace: space.value,
      },
    )
    if (space.value === next) return
    space.value = next
    emit('layerSpace', next)
  }
}

function scaleOutgoingZoom(
  emit: CanvasViewportEmit,
  contentScale: () => number,
): CanvasViewportEmit {
  return (event, ...args) => {
    if (event === 'zoom' || event === 'fitZoom') {
      const emitZoom = emit as (
        name: string,
        ...values: unknown[]
      ) => void
      emitZoom(
        event,
        Math.max(1, Math.round((args[0] as number) / contentScale())),
      )
      return
    }
    const forward = emit as (...values: unknown[]) => void
    forward(event, ...args)
  }
}

/** Interaction geometry stays in its native space; only the display mapping changes. */
export function compositionViewport(
  props: CanvasViewportProps,
  emit: CanvasViewportEmit,
) {
  const enabled = () => compositionActive(props.document, props)
  const space = ref(props.compositionSpace ?? 'content')
  watch(() => props.compositionSpace, (value) => {
    space.value = value ?? 'content'
  }, { flush: 'sync' })
  const card = () => space.value === 'card'
  const layout = computed(() => props.document
    ? resolveCompositionLayout(props.document)
    : undefined)
  const scale = () => enabled() && !card() ? layout.value!.scale : 1
  const viewDocument = computed(() => props.document
    ? projectView(props.document, space.value, enabled())
    : props.document)
  const bounds = () => {
    if (!enabled()) return undefined
    return layoutBounds(layout.value!, card())
  }
  // Plain fields: preview frames must not become reactive props of the workspace.
  const painted: PaintedFrame = {
    full: undefined,
    view: undefined,
    active: false,
  }
  const paintedBounds = shallowRef<ViewportOutputBounds>()
  const paintedScale = shallowRef<number>()
  let onPaint = () => {}
  let wasActive = false
  watch(() => [
    props.scenePreview?.numeric.value,
    props.scenePreview?.composition.value,
    props.document,
    space.value,
    props.activeTool,
    props.quickFrameMode,
  ], () => {
    const full = paintPreview(props, space.value, painted)
    syncPaintedLayout(
      full,
      props,
      card(),
      bounds(),
      scale(),
      paintedBounds,
      paintedScale,
    )
    const active = painted.active
    if (active || wasActive) onPaint()
    wasActive = active
  }, { flush: 'sync' })
  const activateAt = activateComposition(
    props,
    enabled,
    space,
    () => layout.value,
    emit,
  )
  const viewProps = new Proxy(props, {
    get(
      target,
      key,
    ) {
      return previewProp(target, key, {
        props,
        painted,
        committedView: () => viewDocument.value,
        bounds,
        previewBounds: () => paintedBounds.value,
        previewScale: () => paintedScale.value,
        contentScale: scale,
        space: () => space.value,
        compositionEnabled: enabled,
        activateAt,
      })
    },
  })
  return {
    props: viewProps,
    emit: scaleOutgoingZoom(emit, scale),
    bindPaint: (listener: () => void) => {
      onPaint = listener
    },
  }
}
export function mergeCompositionView(
  original: EditorDocumentV1 | undefined,
  view: EditorDocumentV1 | undefined,
  space: 'content' | 'card' = 'content',
): EditorDocumentV1 | undefined {
  if (!original || !view) return view
  const ids = new Set(view.layers.map((layer) => layer.id))
  const card = space === 'card'
  const replacements = new Map(view.layers.map((layer) => [layer.id, layer]))
  const extra = view.layers.filter((layer) => !original.layers.some((l) => l.id === layer.id))
    .map((layer) => card ? { ...layer, space: 'card' as const } : layer)
  return { ...original, layers: [...original.layers.flatMap((layer) => {
    if ((layer.space === 'card') !== card) return [layer]
    return ids.has(layer.id) ? [replacements.get(layer.id)!] : []
  }), ...extra] }
}

export function compositionDraftDocument(
  document: EditorDocumentV1 | undefined,
  props: CanvasViewportProps,
  drawing: LayerNode | undefined,
  precision: LayerNode | undefined,
): EditorDocumentV1 | undefined {
  const added = props.compositionDocument && drawing?.kind === 'marker' ? drawing : precision
  return document && added ? { ...document, layers: [...document.layers, added] } : document
}
