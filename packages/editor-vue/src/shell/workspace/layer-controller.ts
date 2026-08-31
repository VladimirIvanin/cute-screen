import type { Ref } from 'vue'
import {
  rebaseRulerLayer,
  type EditorDocumentV1,
  type JsonObject,
  type LayerNode,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../contracts'

export interface LayerControllerContext {
  readonly props: ResolvedEditorShellProps
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly store: {
    readonly selectedLayerIds: readonly string[]
    selectLayer(id: string, toggle?: boolean, range?: boolean): void
  }
}

function canonicalTransform(
  context: LayerControllerContext,
  layer: LayerNode,
  transform: Transform2D,
): LayerNode {
  const canvas = context.activeDocument.value?.canvas
  if (layer.kind !== 'ruler' || !canvas) return { ...layer, transform }
  return rebaseRulerLayer({ ...layer, transform }, layer.payload, canvas)
}

function updateLayerProperty(
  context: LayerControllerContext,
  id: string,
  property: 'visible' | 'locked' | 'opacity' | 'rotation',
  value?: number,
): void {
  const layer = context.activeDocument.value?.layers.find(
    (candidate) => candidate.id === id,
  )
  if (
    !layer ||
    !context.props.documentSession ||
    (layer.locked && property !== 'locked')
  ) {
    return
  }
  if (property === 'opacity') {
    if (
      layer.kind === 'text' ||
      layer.kind === 'callout' ||
      layer.kind === 'numberedMarker'
    ) {
      return
    }
    context.props.documentSession.execute({
      type: 'updateLayer',
      before: layer,
      after: {
        ...layer,
        opacity: Math.max(0, Math.min(1, value ?? layer.opacity)),
      },
    })
    return
  }
  const after =
    property === 'visible'
      ? { ...layer, visible: !layer.visible }
      : property === 'locked'
        ? { ...layer, locked: !layer.locked }
        : canonicalTransform(context, layer, {
            ...layer.transform,
            rotation: value ?? layer.transform.rotation,
          })
  context.props.documentSession.execute({
    type: 'updateLayer',
    before: layer,
    after,
  })
}

function reorderLayer(
  context: LayerControllerContext,
  id: string,
  direction: 'up' | 'down',
): void {
  const layers = context.activeDocument.value?.layers
  if (!layers || !context.props.documentSession) return
  const fromIndex = layers.findIndex((layer) => layer.id === id)
  const toIndex = fromIndex + (direction === 'up' ? 1 : -1)
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    toIndex >= layers.length ||
    layers[fromIndex]?.locked
  ) {
    return
  }
  context.props.documentSession.execute({
    type: 'reorderLayer',
    layerId: id,
    fromIndex,
    toIndex,
  })
}

function reorderIndex(
  layerCount: number,
  fromIndex: number,
  targetIndex: number,
  place: 'before' | 'after',
): number {
  const sourceDisplay = layerCount - 1 - fromIndex
  const targetDisplay = layerCount - 1 - targetIndex
  let insertDisplay = place === 'before' ? targetDisplay : targetDisplay + 1
  if (sourceDisplay < insertDisplay) insertDisplay -= 1
  return layerCount - 1 - insertDisplay
}

function reorderLayerTo(
  context: LayerControllerContext,
  id: string,
  targetId: string,
  place: 'before' | 'after',
): void {
  const layers = context.activeDocument.value?.layers
  if (!layers || !context.props.documentSession) return
  const fromIndex = layers.findIndex((layer) => layer.id === id)
  const targetIndex = layers.findIndex((layer) => layer.id === targetId)
  if (
    fromIndex < 0 ||
    targetIndex < 0 ||
    layers[fromIndex]?.locked ||
    fromIndex === targetIndex
  ) {
    return
  }
  const toIndex = reorderIndex(layers.length, fromIndex, targetIndex, place)
  if (fromIndex === toIndex) return
  context.props.documentSession.execute({
    type: 'reorderLayer',
    layerId: id,
    fromIndex,
    toIndex,
  })
}

function moveLayer(
  context: LayerControllerContext,
  id: string,
  deltaX: number,
  deltaY: number,
): void {
  const selected = new Set(context.store.selectedLayerIds)
  const layers = context.activeDocument.value?.layers.filter((layer) =>
    selected.has(layer.id),
  )
  if (
    !layers?.length ||
    !context.props.documentSession ||
    !selected.has(id) ||
    layers.some((layer) => layer.locked)
  ) {
    return
  }
  const commands = layers.map((layer) => ({
    type: 'updateLayer' as const,
    before: layer,
    after: canonicalTransform(context, layer, {
      ...layer.transform,
      translateX: layer.transform.translateX + deltaX,
      translateY: layer.transform.translateY + deltaY,
    }),
  }))
  context.props.documentSession.execute(
    commands.length === 1 ? commands[0]! : { type: 'batch', commands },
  )
}

function transformLayer(
  context: LayerControllerContext,
  id: string,
  transform: Transform2D,
): void {
  const layer = context.activeDocument.value?.layers.find(
    (candidate) => candidate.id === id,
  )
  if (!layer || layer.locked || !context.props.documentSession) return
  context.props.documentSession.execute({
    type: 'updateLayer',
    before: layer,
    after: canonicalTransform(context, layer, transform),
  })
}

function updateLayerPayload(
  context: LayerControllerContext,
  id: string,
  payload: JsonObject,
): void {
  const layer = context.activeDocument.value?.layers.find(
    (candidate) => candidate.id === id,
  )
  if (!layer || layer.locked || !context.props.documentSession) return
  context.props.documentSession.execute({
    type: 'updateLayer',
    before: layer,
    after: { ...layer, payload } as LayerNode,
  })
}

function addLayer(
  context: LayerControllerContext,
  layer: LayerNode,
  selectAfter = false,
): void {
  if (!context.props.documentSession || context.props.readOnlyDocument) return
  context.props.documentSession.execute({ type: 'addLayer', layer })
  if (selectAfter && layer.kind === 'loupe') context.store.selectLayer(layer.id)
}

export function createLayerController(context: LayerControllerContext) {
  return {
    updateLayerProperty: (
      id: string,
      property: 'visible' | 'locked' | 'opacity' | 'rotation',
      value?: number,
    ) => updateLayerProperty(context, id, property, value),
    reorderLayer: (id: string, direction: 'up' | 'down') =>
      reorderLayer(context, id, direction),
    onLayerOpacity: (id: string, value: number) =>
      updateLayerProperty(context, id, 'opacity', value),
    onLayerRotation: (id: string, value: number) =>
      updateLayerProperty(context, id, 'rotation', value),
    onLayerReorderTo: (
      id: string,
      targetId: string,
      place: 'before' | 'after',
    ) => reorderLayerTo(context, id, targetId, place),
    moveLayer: (id: string, deltaX: number, deltaY: number) =>
      moveLayer(context, id, deltaX, deltaY),
    selectLayer: (id: string, toggle = false, range = false) =>
      context.store.selectLayer(id, toggle, range),
    transformLayer: (id: string, transform: Transform2D) =>
      transformLayer(context, id, transform),
    updateLayerPayload: (id: string, payload: JsonObject) =>
      updateLayerPayload(context, id, payload),
    addLayer: (layer: LayerNode, selectAfter = false) =>
      addLayer(context, layer, selectAfter),
  }
}
