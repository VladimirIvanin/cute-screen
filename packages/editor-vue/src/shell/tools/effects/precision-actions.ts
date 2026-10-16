import type { Ref } from 'vue'
import {
  measureRuler,
  removeSpotlightAperture,
  type EditorDocumentV1,
  type SpotlightLayer,
} from '@cute-screen/editor-renderer'
import type { SpotlightEditing } from '../../canvas/contracts'
import type { ResolvedEditorShellProps } from '../../contracts'

interface PrecisionActionsContext {
  readonly props: ResolvedEditorShellProps
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly spotlightEditing: Ref<SpotlightEditing | undefined>
  readonly selectedLayerId: () => string | undefined
  readonly locale: () => 'en' | 'ru'
  readonly reportFeedback: (message: string) => void
  readonly reportResourceError: (message: string) => void
}

async function copyMeasurement(
  context: PrecisionActionsContext,
  id: string,
): Promise<void> {
  const document = context.activeDocument.value
  const layer = document?.layers.find((item) => item.id === context.selectedLayerId())
  if (layer?.kind !== 'ruler' || !document) return
  const measurement = measureRuler(layer, document.canvas)
  const value = id === 'rulerCopyLength' ? measurement.label : `${measurement.angleDegrees.toFixed(1)}°`
  try {
    if (context.props.clipboardBridge?.writeClipboardText) {
      await context.props.clipboardBridge.writeClipboardText(value, crypto.randomUUID())
    } else if (navigator.clipboard) await navigator.clipboard.writeText(value)
    else throw new Error(context.locale() === 'ru' ? 'Буфер обмена недоступен' : 'Clipboard unavailable')
    context.reportFeedback(context.locale() === 'ru' ? `Скопировано: ${value}` : `Copied: ${value}`)
  } catch (error) {
    const message = context.locale() === 'ru' ? 'Не удалось скопировать измерение' : 'Could not copy measurement'
    context.reportResourceError(`${message}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function removeAperture(
  context: PrecisionActionsContext,
  layer: SpotlightLayer,
): void {
  const editing = context.spotlightEditing.value
  if (!editing) return
  const after = removeSpotlightAperture(layer, editing.apertureId)
  context.props.documentSession?.execute(after
    ? { type: 'updateLayer', before: layer, after }
    : { type: 'removeLayer', layer, index: context.activeDocument.value!.layers.indexOf(layer) })
  context.spotlightEditing.value = after ? { layerId: after.id, apertureId: after.payload.apertures[0]!.id } : undefined
}

function editSpotlight(
  context: PrecisionActionsContext,
  id: string,
): void {
  if (id === 'spotlightExit') {
    context.spotlightEditing.value = undefined
    return
  }
  const layer = context.activeDocument.value?.layers.find((item) => item.id === context.selectedLayerId())
  if (
    layer?.kind !== 'spotlight' ||
    layer.locked ||
    context.props.readOnlyDocument
  ) return
  if (id === 'spotlightAdd' && layer.payload.apertures.length < 64) {
    context.spotlightEditing.value = { layerId: layer.id, apertureId: layer.payload.apertures[0]!.id, adding: true }
  }
  if (id.startsWith('spotlightEdit:')) {
    const apertureId = id.slice('spotlightEdit:'.length)
    if (layer.payload.apertures.some((item) => item.id === apertureId)) {
      context.spotlightEditing.value = { layerId: layer.id, apertureId }
    }
  }
  if (id === 'spotlightRemove') removeAperture(context, layer)
}

export function createPrecisionActions(context: PrecisionActionsContext) {
  return async (id: string): Promise<boolean> => {
    if (id === 'rulerCopyLength' || id === 'rulerCopyAngle') {
      await copyMeasurement(context, id)
      return true
    }
    if (!id.startsWith('spotlight')) return false
    editSpotlight(context, id)
    return true
  }
}
