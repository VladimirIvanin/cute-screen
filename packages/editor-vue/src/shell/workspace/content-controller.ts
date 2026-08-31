import type { Ref, ShallowRef } from 'vue'
import {
  createContentImageLayer,
  createTextLayer,
  type EditorCommand,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import { loadImageWithBinaryFallback } from '../../image-transport'
import type { TextToolDefaults } from '../canvas/contracts'
import type { ResolvedEditorShellProps } from '../contracts'

export interface ContentControllerContext {
  readonly props: ResolvedEditorShellProps
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly contentImageImporting: Ref<boolean>
  readonly textureImages: Ref<ReadonlyMap<string, HTMLImageElement>>
  readonly textDefaults: ShallowRef<TextToolDefaults>
  readonly selectedLayerId: Ref<string | undefined>
}

async function importContentImage(
  context: ContentControllerContext,
  origin: { readonly x: number; readonly y: number },
): Promise<void> {
  const bridge = context.props.contentImageBridge
  if (
    context.contentImageImporting.value ||
    !bridge ||
    !context.props.documentSession ||
    context.props.readOnlyDocument
  ) {
    return
  }
  context.contentImageImporting.value = true
  try {
    const imported = await bridge.importContentImage(crypto.randomUUID())
    if (imported.kind !== 'imported') return
    const resource = await loadImageWithBinaryFallback({
      token: imported.resourceToken,
      correlationId: crypto.randomUUID(),
      bridge,
      createResource: async (image) => image,
    })
    context.textureImages.value = new Map(context.textureImages.value).set(
      imported.blobHash,
      resource.resource,
    )
    const layer = createContentImageLayer({
      id: crypto.randomUUID(),
      blobHash: imported.blobHash,
      format: imported.format,
      intrinsicWidth: imported.width,
      intrinsicHeight: imported.height,
      origin: {
        x: origin.x - imported.width / 2,
        y: origin.y - imported.height / 2,
      },
    })
    context.props.documentSession.execute({ type: 'addLayer', layer })
  } finally {
    context.contentImageImporting.value = false
  }
}

async function pasteNativeClipboard(
  context: ContentControllerContext,
): Promise<void> {
  const bridge = context.props.clipboardBridge
  const document = context.activeDocument.value
  if (
    !bridge ||
    !document ||
    !context.props.documentSession ||
    context.props.readOnlyDocument
  ) {
    return
  }
  try {
    const snapshot = await bridge.readClipboardSnapshot(crypto.randomUUID())
    const center = {
      x: document.canvas.width / 2,
      y: document.canvas.height / 2,
    }
    if (snapshot.bitmap) {
      const bitmap = snapshot.bitmap
      const loaded = await loadImageWithBinaryFallback({
        token: bitmap.resourceToken,
        correlationId: crypto.randomUUID(),
        bridge,
        createResource: async (image) => image,
      })
      context.textureImages.value = new Map(context.textureImages.value).set(
        bitmap.blobHash,
        loaded.resource,
      )
      context.props.documentSession.execute({
        type: 'addLayer',
        layer: createContentImageLayer({
          id: crypto.randomUUID(),
          blobHash: bitmap.blobHash,
          format: bitmap.format,
          intrinsicWidth: bitmap.width,
          intrinsicHeight: bitmap.height,
          origin: {
            x: center.x - bitmap.width / 2,
            y: center.y - bitmap.height / 2,
          },
        }),
      })
      return
    }
    if (!snapshot.text) return
    const defaults = context.textDefaults.value
    const layer = createTextLayer({
      id: crypto.randomUUID(),
      text: snapshot.text,
      origin: center,
      fontFamily: defaults.fontFamily,
      fontSize: defaults.fontSize,
      weight: defaults.weight,
      italic: defaults.italic,
      strikethrough: defaults.strikethrough,
      alignment: defaults.alignment,
      listKind: defaults.listKind,
      color: defaults.color,
      background: defaults.background,
    })
    if (layer)
      context.props.documentSession.execute({ type: 'addLayer', layer })
  } catch (error) {
    console.warn('cute-screen native clipboard paste failed', error)
  }
}

async function copySelectedTextLayer(
  context: ContentControllerContext,
  cut: boolean,
): Promise<void> {
  const bridge = context.props.clipboardBridge
  const document = context.activeDocument.value
  const layerId = context.selectedLayerId.value
  if (
    !bridge?.writeClipboardText ||
    !document ||
    !layerId ||
    !context.props.documentSession ||
    context.props.readOnlyDocument
  ) {
    return
  }
  const index = document.layers.findIndex((layer) => layer.id === layerId)
  const layer = document.layers[index]
  if (layer?.kind !== 'text' || layer.locked) return
  try {
    await bridge.writeClipboardText(
      layer.payload.content.text,
      crypto.randomUUID(),
    )
    if (cut) {
      context.props.documentSession.execute({
        type: 'removeLayer',
        layer,
        index,
      })
    }
  } catch (error) {
    console.warn('cute-screen native text clipboard write failed', error)
  }
}

export function createContentController(context: ContentControllerContext) {
  return {
    importContentImage: (origin: { readonly x: number; readonly y: number }) =>
      importContentImage(context, origin),
    pasteNativeClipboard: () => pasteNativeClipboard(context),
    copySelectedTextLayer: (cut: boolean) =>
      copySelectedTextLayer(context, cut),
    executeDocumentCommand: (command: unknown) => {
      if (!context.props.documentSession || context.props.readOnlyDocument)
        return
      context.props.documentSession.execute(command as EditorCommand)
    },
  }
}
