import {
  computed,
  ref,
  watch,
} from 'vue'
import {
  DEFAULT_PRESENTATION_SETTINGS,
  resolveCompositionLayout,
  compositionInteractionSpace,
  type EditorDocumentV1,
  type LayerNode,
} from '@cute-screen/editor-renderer'
import type {
  CanvasViewportProps,
  CanvasViewportEmit,
} from './contracts'

/** Interaction geometry stays in its native space; only the display mapping changes. */
export function compositionViewport(
  props: CanvasViewportProps,
  emit: CanvasViewportEmit,
) {
  const enabled = () => Boolean(props.document?.presentation.composition && props.activeTool !== 'crop' && !props.quickFrameMode)
  const space = ref(props.compositionSpace ?? 'content')
  watch(() => props.compositionSpace, (value) => {
    space.value = value ?? 'content'
  }, { flush: 'sync' })
  const card = () => space.value === 'card'
  const layout = computed(() => props.document ? resolveCompositionLayout(props.document) : undefined)
  const scale = () => enabled() && !card() ? layout.value!.scale : 1
  const viewDocument = computed(() => {
    const doc = props.document
    if (!doc) return doc
    if (!doc.presentation.composition) return { ...doc, layers: doc.layers.filter((layer) => layer.space !== 'card') }
    const l = layout.value!
    return { ...doc, presentation: DEFAULT_PRESENTATION_SETTINGS,
      canvas: card() && enabled() ? { width: l.width, height: l.height } : doc.canvas,
      crop: card() && enabled() ? null : doc.crop,
      layers: doc.layers.filter((layer) => (layer.space === 'card') === (card() && enabled())) }
  })
  const bounds = () => {
    if (!enabled()) return undefined
    const l = layout.value!
    return card() ? { x: 0, y: 0, width: l.width, height: l.height }
      : { x: l.source.x - l.content.x / l.scale, y: l.source.y - l.content.y / l.scale,
          width: l.width / l.scale, height: l.height / l.scale }
  }
  const viewProps = new Proxy(props, { get(
    target,
    key,
  ) {
    if (key === 'document') return viewDocument.value
    if (key === 'exportDocument') return props.exportDocument ?? props.document
    if (key === 'compositionDocument') return enabled() ? props.document : undefined
    if (key === 'compositionBounds') return bounds()
    if (key === 'canvas') return viewDocument.value?.canvas ?? props.canvas
    if (key === 'zoom') return (props.zoom ?? 100) * scale()
    if (key === 'compositionSpace') return space.value
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
  return { props: viewProps, emit: viewEmit }
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
