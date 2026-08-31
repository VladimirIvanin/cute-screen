import type { Ref } from 'vue'
import type { CropPreset } from '@cute-screen/editor-renderer'

interface CropPort {
  setCropPresetValue(preset: CropPreset): void
}

export interface ContextEffectsContext {
  readonly activeToolId: Ref<string | undefined>
  readonly cropPreset: Ref<CropPreset>
  readonly markerShape: Ref<'circle' | 'square' | 'diamond' | 'star'>
  readonly canvas: Ref<CropPort | undefined>
  readonly applyTextChange: (id: string, value: string) => boolean
  readonly applyCalloutChange: (id: string, value: string) => boolean
  readonly applyPrecisionChange: (id: string, value: string) => boolean
  readonly applyImageChange: (id: string, value: string) => boolean
  readonly applyDrawingChange: (id: string, value: string) => boolean
}

function applyCropChange(
  context: ContextEffectsContext,
  id: string,
  value: string,
): boolean {
  if (id !== 'cropPreset') return false
  if (!['free', '1:1', '4:3', '16:9', 'original'].includes(value)) return true
  context.cropPreset.value = value as CropPreset
  context.canvas.value?.setCropPresetValue(context.cropPreset.value)
  return true
}

function applyMarkerChange(
  context: ContextEffectsContext,
  value: string,
): boolean {
  if (context.activeToolId.value !== 'numberedMarker') return false
  if (['circle', 'square', 'diamond', 'star'].includes(value)) {
    context.markerShape.value = value as typeof context.markerShape.value
  }
  return true
}

export function createContextEffects(context: ContextEffectsContext) {
  function onContextChange(id: string, value: string): void {
    if (context.applyTextChange(id, value)) return
    if (context.applyCalloutChange(id, value)) return
    if (applyCropChange(context, id, value)) return
    if (context.applyPrecisionChange(id, value)) return
    if (context.applyImageChange(id, value)) return
    if (applyMarkerChange(context, value)) return
    context.applyDrawingChange(id, value)
  }
  return { onContextChange }
}
