import type { LayerNode } from '../../document/types'
import { normalizeEditableLayerScale } from '../../layer-resize'
import {
  decodeClipboardLayersV2,
  type ClipboardLayersV2,
} from './clipboard-codec'
import { cloneLayer, contentImage } from './shared'

export type ClipboardDispatch =
  | Readonly<{
      kind: 'internal'
      payload: ClipboardLayersV2
      warning?: 'internalPayloadInvalid'
    }>
  | Readonly<{ kind: 'bitmap'; warning?: 'internalPayloadInvalid' }>
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'emptyHint' }>
  | Readonly<{ kind: 'empty' }>

/**
 * Routes one atomic native clipboard snapshot without exposing its bytes.
 * Empty state intentionally accepts only a bitmap, avoiding a phantom document.
 */
export function routeClipboardSnapshot(input: {
  readonly activeDocument: boolean
  readonly internal?: string
  readonly bitmapAvailable?: boolean
  readonly text?: string
}): ClipboardDispatch {
  let warning: 'internalPayloadInvalid' | undefined
  if (input.activeDocument && input.internal !== undefined) {
    try {
      return Object.freeze({
        kind: 'internal' as const,
        payload: decodeClipboardLayersV2(input.internal),
      })
    } catch {
      warning = 'internalPayloadInvalid'
    }
  }
  if (input.bitmapAvailable) {
    return Object.freeze({
      kind: 'bitmap' as const,
      ...(warning === undefined ? {} : { warning }),
    })
  }
  if (input.activeDocument && input.text !== undefined) {
    return Object.freeze({ kind: 'text' as const, text: input.text })
  }
  return Object.freeze({
    kind: input.activeDocument ? ('empty' as const) : ('emptyHint' as const),
  })
}

export function pasteClipboardLayers(
  payload: ClipboardLayersV2,
  input: {
    readonly id: () => string
    readonly zoom: number
    readonly cascadeIndex: number
  },
): readonly LayerNode[] {
  if (!Number.isFinite(input.zoom) || input.zoom <= 0) {
    throw new Error('clipboard paste zoom must be positive and finite')
  }
  if (!Number.isInteger(input.cascadeIndex) || input.cascadeIndex < 0) {
    throw new Error('clipboard cascade index must be a non-negative integer')
  }
  const offset = (16 * input.cascadeIndex) / input.zoom
  const ids = new Set<string>()
  return Object.freeze(
    payload.layers.map((source) => {
      const id = input.id()
      if (ids.has(id))
        throw new Error('clipboard paste id generator returned a duplicate')
      ids.add(id)
      const layer = normalizeEditableLayerScale(
        contentImage(cloneLayer(source)),
      )
      return Object.freeze({
        ...layer,
        id,
        locked: false,
        transform: {
          ...layer.transform,
          translateX: layer.transform.translateX + offset,
          translateY: layer.transform.translateY + offset,
        },
      }) as LayerNode
    }),
  )
}

/** Converts a completed DOM-free text session into the sole document mutation. */
