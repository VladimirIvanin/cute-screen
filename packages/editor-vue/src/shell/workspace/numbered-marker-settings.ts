import {
  rememberDrawingColor,
  applyLayerStyle,
  type EditorCommand,
  type LayerNode,
} from '@cute-screen/editor-renderer'
import { parseHexColor } from '../tools/effects/color'
import type { DrawingToolPreferencesV2 } from '@cute-screen/editor-renderer'
import {
  measuredNumberedMarkerLayer,
  setNumberedMarkerSequence,
  setNumberedMarkerCaption,
} from '@cute-screen/editor-renderer'
import type { createWorkspaceState } from './workspace-state'
import type { ResolvedEditorShellProps } from '../contracts'
import type { useEditorShellStore } from '../store'

export function changeNumberedMarkerSetting(
  props: ResolvedEditorShellProps,
  workspace: ReturnType<typeof createWorkspaceState>,
  store: ReturnType<typeof useEditorShellStore>,
  id: string,
  value: string,
): boolean {
  if (!['markerNext', 'markerAuto', 'markerSequence', 'markerRemoveCaption', 'markerEditLabel'].includes(id)) return false
  if (props.readOnlyDocument || store.actionState.status === 'pending') return true
  if (id === 'markerAuto') {
    workspace.markerNextOverride.value = undefined
    return true
  }
  const number = Number(value)
  if (id === 'markerNext') {
    if (Number.isSafeInteger(number) && number > 0) workspace.markerNextOverride.value = number
    return true
  }
  if (
    store.selectedLayerIds.length !== 1 ||
    workspace.toolConfigure.value ||
    workspace.textDraft.value
  ) return true
  const layer = workspace.activeDocument.value?.layers.find((candidate) => candidate.id === store.selectedLayerId)
  if (layer?.kind !== 'numberedMarker' || layer.locked) return true
  if (id === 'markerEditLabel') {
    workspace.canvasViewport.value?.editSelectedLabel()
    return true
  }
  const sequence = id === 'markerRemoveCaption' ? layer.payload.sequence : number
  if (
    !Number.isSafeInteger(sequence) ||
    sequence <= 0 ||
    !props.documentSession
  ) return true
  const after = measuredNumberedMarkerLayer(id === 'markerRemoveCaption'
    ? setNumberedMarkerCaption(layer, { text: '', wrap: 'autoSize', spans: [], paragraphs: [] })
    : setNumberedMarkerSequence(layer, sequence))
  if (JSON.stringify(after) !== JSON.stringify(layer)) props.documentSession.execute({ type: 'updateLayer', before: layer, after })
  return true
}

export function markerColorChange(
  context: {
    readonly props: ResolvedEditorShellProps
    readonly store: ReturnType<typeof useEditorShellStore>
    readonly workspace: ReturnType<typeof createWorkspaceState>
    readonly saveDrawingPreferences: (value: DrawingToolPreferencesV2) => void
  },
  id: string,
  value: string,
) {
  const { props, store, workspace } = context
  const layersLocked = () => workspace.activeDocument.value?.layers.some((layer) =>
    store.selectedLayerIds.includes(layer.id) && layer.locked) ?? false
  if (
    ['markerBadgeColor', 'textColor'].includes(id) &&
    !props.readOnlyDocument &&
    !layersLocked()
  ) {
    const color = parseHexColor(value)
    if (color) {
      workspace.drawingPreferences.value = rememberDrawingColor(workspace.drawingPreferences.value, color)
      context.saveDrawingPreferences(workspace.drawingPreferences.value)
    }
  }
  if (id === 'markerBadgeColor') {
    id = 'textBackground'
    value = JSON.stringify({ color: value, padding: 0, radius: 0 })
  }
  return { id, value }
}

export function markerShapeCommand(
  layer: LayerNode,
  id: string,
  value: string,
): EditorCommand | undefined {
  if (
    id !== 'markerShape' ||
    layer.kind !== 'numberedMarker' ||
    !['circle', 'square', 'diamond', 'star'].includes(value)
  ) return undefined
  return {
    type: 'updateLayer',
    before: layer,
    after: measuredNumberedMarkerLayer(applyLayerStyle(layer, { badgeShape: value })),
  }
}
