import type { EditorCommand } from '@cute-screen/editor-renderer'
import type { ContentControllerContext } from './content-contracts'
import { ImageInsertionController } from './image-insertion-controller'
export type { ContentControllerContext } from './content-contracts'

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
    await bridge.writeClipboardText(layer.payload.content.text, crypto.randomUUID())
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
  const images = new ImageInsertionController(context)
  return {
    importContentImage: (origin?: { readonly x: number; readonly y: number }) => images.import(origin),
    importDroppedImage: (token: string, target: import('../../texture-fill').ImageInsertionTarget) => images.drop(token, target),
    openDroppedDocument: (token: string) => images.openDocument(token),
    pasteNativeClipboard: () => images.paste(),
    cancelImageImport: () => images.cancel(),
    dispose: () => images.dispose(),
    copySelectedTextLayer: (cut: boolean) => copySelectedTextLayer(context, cut),
    executeDocumentCommand: (command: unknown) => {
      if (!context.props.documentSession || context.props.readOnlyDocument) return
      const typed = command as EditorCommand | null
      if (!typed) return
      if (typed.type === 'addLayer') context.addLayer(typed.layer)
      else context.props.documentSession.execute(typed)
      if (typed.type === 'addLayer') context.rememberTextDefaults(typed.layer)
      else if (typed.type === 'updateLayer') context.rememberTextDefaults(typed.after)
    },
  }
}
