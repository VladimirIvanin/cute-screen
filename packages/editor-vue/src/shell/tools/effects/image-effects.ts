import type { Ref } from 'vue'
import type { EditorDocumentV1, ImageLayer } from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../../contracts'
import type { ToolSettingsEffect } from './contracts'
import { parseHexColor } from './color'

type ImageControlId =
  'imageRadius' | 'imageBorderColor' | 'imageBorderWidth' | 'imageOpacity'

const IMAGE_CONTROL_IDS = new Set<ImageControlId>([
  'imageRadius',
  'imageBorderColor',
  'imageBorderWidth',
  'imageOpacity',
])

export interface ImageEffectsContext {
  readonly props: ResolvedEditorShellProps
  readonly selectedLayerId: Ref<string | undefined>
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
}

function selectedImage(context: ImageEffectsContext): ImageLayer | undefined {
  const layer = context.activeDocument.value?.layers.find(
    (candidate) => candidate.id === context.selectedLayerId.value,
  )
  return layer?.kind === 'image' && layer.payload.role === 'content'
    ? layer
    : undefined
}

function updatedImage(
  image: ImageLayer,
  id: ImageControlId,
  value: string,
): ImageLayer | undefined {
  const currentBorder = image.payload.border
  const defaultBorder = {
    color: { red: 0, green: 0, blue: 0, alpha: 1 },
    width: 2,
    style: 'solid' as const,
    cap: 'round' as const,
    join: 'round' as const,
  }
  if (id === 'imageRadius') {
    const radius = Number(value)
    const maxRadius =
      Math.min(image.localBounds?.width ?? 0, image.localBounds?.height ?? 0) /
      2
    return Number.isFinite(radius) && radius >= 0 && radius <= maxRadius
      ? { ...image, payload: { ...image.payload, radius } }
      : undefined
  }
  if (id === 'imageOpacity') {
    const opacity = Number(value)
    return Number.isFinite(opacity) && opacity >= 0 && opacity <= 1
      ? { ...image, opacity }
      : undefined
  }
  if (id === 'imageBorderWidth') {
    const width = Number(value)
    if (!Number.isFinite(width) || width < 0 || width > 16) return undefined
    return {
      ...image,
      payload: {
        ...image.payload,
        border:
          width === 0 ? null : { ...(currentBorder ?? defaultBorder), width },
      },
    }
  }
  const color = parseHexColor(value)
  if (!color) return undefined
  return {
    ...image,
    payload: {
      ...image.payload,
      border: { ...(currentBorder ?? defaultBorder), color },
    },
  }
}

function resolveImageEffect(
  context: ImageEffectsContext,
  id: string,
  value: string,
): ToolSettingsEffect {
  if (!IMAGE_CONTROL_IDS.has(id as ImageControlId)) {
    return { kind: 'unhandled' }
  }
  const image = selectedImage(context)
  if (!image || !context.props.documentSession || image.locked) {
    return { kind: 'handled' }
  }
  const after = updatedImage(image, id as ImageControlId, value)
  return after
    ? {
        kind: 'command',
        command: { type: 'updateLayer', before: image, after },
      }
    : { kind: 'handled' }
}

export function createImageEffects(context: ImageEffectsContext) {
  function applyImageChange(id: string, value: string): boolean {
    const effect = resolveImageEffect(context, id, value)
    if (effect.kind === 'unhandled') return false
    if (effect.kind === 'command') {
      context.props.documentSession?.execute(effect.command)
    }
    return true
  }
  return { applyImageChange }
}
