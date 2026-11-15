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
  const layout = computed(() => props.document ? resolveCompositionLayout(props.document) : undefined)
  const scale = () => enabled() && !card() ? layout.value!.scale : 1
  const viewDocument = computed(() => props.document
    ? projectView(props.document, space.value, enabled())
    : props.document)
  const bounds = () => {
    if (!enabled()) return undefined
    return layoutBounds(layout.value!, card())
  }
  // Plain fields: preview frames must not become reactive props of the workspace.
  const painted = {
    full: undefined as EditorDocumentV1 | undefined,
    view: undefined as EditorDocumentV1 | undefined,
    active: false,
  }
  const paintedBounds = shallowRef<ViewportOutputBounds>()
  const paintedScale = shallowRef<number>()
  let onPaint = () => {}
  let wasActive = false
  function syncPaintedFrame(full: EditorDocumentV1 | undefined): void {
    const active = full ? compositionActive(full, props) : false
    const previewLayout = full?.presentation.composition ? resolveCompositionLayout(full) : undefined
    const nextBounds = previewLayout && active ? layoutBounds(previewLayout, card()) : undefined
    if (!sameBounds(nextBounds, bounds())) {
      if (!sameBounds(paintedBounds.value, nextBounds)) paintedBounds.value = nextBounds
    } else if (paintedBounds.value) paintedBounds.value = undefined
    const nextScale = previewLayout && active && !card() ? previewLayout.scale : undefined
    if (nextScale !== undefined && nextScale !== scale()) {
      if (paintedScale.value !== nextScale) paintedScale.value = nextScale
    } else if (paintedScale.value !== undefined) paintedScale.value = undefined
  }
  watch(() => [
    props.scenePreview?.numeric.value,
    props.scenePreview?.composition.value,
    props.document,
    space.value,
    props.activeTool,
    props.quickFrameMode,
  ], () => {
    const numeric = props.scenePreview?.numeric.value
    const composition = props.scenePreview?.composition.value
    const active = Boolean(numeric || composition)
    const base = numeric ?? props.document
    const full = base && composition
      ? { ...base, presentation: { ...base.presentation, composition } }
      : active ? base : undefined
    painted.full = full
    painted.view = full ? projectView(full, space.value, compositionActive(full, props)) : undefined
    painted.active = active
    syncPaintedFrame(full)
    if (active || wasActive) onPaint()
    wasActive = active
  }, { flush: 'sync' })
  const viewProps = new Proxy(props, { get(
    target,
    key,
  ) {
    if (key === 'document') {
      const committed = viewDocument.value
      return painted.view ?? committed
    }
    if (key === 'exportDocument') return props.exportDocument ?? props.document
    if (key === 'compositionDocument') {
      const full = painted.full ?? props.document
      return compositionActive(full, props) ? full : undefined
    }
    if (key === 'compositionBounds') return bounds()
    if (key === 'previewBounds') return paintedBounds.value
    if (key === 'previewZoomScale') return paintedScale.value
    if (key === 'canvas') return (painted.view ?? viewDocument.value)?.canvas ?? props.canvas
    if (key === 'zoom') return (props.zoom ?? 100) * (paintedScale.value ?? scale())
    if (key === 'compositionSpace') return space.value
    if (key === 'interactivePreview') return Boolean(target.interactivePreview || painted.active)
    if (key === 'activateCompositionAt') return enabled() ? activateAt : undefined
    return Reflect.get(target, key)
  } })
  function activateAt(
    event: MouseEvent,
    preserveSelection = false,
  ): void {
    if (
      !enabled() ||
      !props.document ||
      props.sampling ||
      props.activeTool === 'hand'
    ) return
    const canvas = event.currentTarget as HTMLCanvasElement | null
    const bounds = canvas?.getBoundingClientRect()
    if (!bounds?.width || !bounds.height) return
    const l = layout.value!
    const point = { x: (event.clientX - bounds.left) * l.width / bounds.width,
      y: (event.clientY - bounds.top) * l.height / bounds.height }
    const next = compositionInteractionSpace(props.document, point,
      { selecting: props.activeTool === 'select', preserveSelection, currentSpace: space.value })
    if (space.value !== next) {
      space.value = next
      emit('layerSpace', next)
    }
  }
  const viewEmit: CanvasViewportEmit = (event, ...args) => {
    if (event === 'zoom' || event === 'fitZoom') {
      ;
      (emit as (event: string,
        ...args: unknown[]) => void)(event,
        Math.max(1,
          Math.round((args[0] as number) / scale())))
      return
    }
    ;
    (emit as (...values: unknown[]) => void)(event, ...args)
  }
  return {
    props: viewProps,
    emit: viewEmit,
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
