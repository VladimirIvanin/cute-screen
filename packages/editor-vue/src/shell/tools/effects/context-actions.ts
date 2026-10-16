import { createPrecisionActions } from './precision-actions'
import type { Ref } from 'vue'
import {
  createFlipCanvasCommand,
  type CropPreset,
  type EditorDocumentV1,
  type JsonObject,
} from '@cute-screen/editor-renderer'
import { TextureResourceResolver } from '../../../texture-fill'
import type { ResolvedEditorShellProps } from '../../contracts'
import type { CanvasViewportExpose } from '../../canvas/contracts'
export interface ContextActionsContext {
  readonly spotlightEditing: Ref<import('../../canvas/contracts').SpotlightEditing | undefined>
  readonly selectedLayerId: () => string | undefined
  readonly locale: () => 'en' | 'ru'
  readonly reportFeedback: (message: string) => void
  readonly props: ResolvedEditorShellProps
  readonly canvas: Ref<CanvasViewportExpose | undefined>
  readonly cropPreset: Ref<CropPreset>
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly textureImages: Ref<ReadonlyMap<string, HTMLImageElement>>
  readonly applyTextureFill: (fill: JsonObject) => void
  readonly reportResourceError: (message: string) => void
}
function textureBlobHash(fill: unknown): string | undefined {
  if (!fill || typeof fill !== 'object')
    return undefined
  const candidate = fill as Record<string, unknown>
  return candidate.kind === 'imageTexture' && typeof candidate.blobHash === 'string' ? candidate.blobHash : undefined
}
function documentTextureHashes(document: EditorDocumentV1): readonly string[] {
  return document.layers.flatMap((layer) => {
    if (layer.kind === 'image' && layer.payload.role === 'content') {
      return [layer.payload.blobHash]
    }
    if (layer.kind !== 'shape')
      return []
    const blobHash = textureBlobHash(layer.payload.fill)
    return blobHash ? [blobHash] : []
  })
}
function importedShapePayload(
  current: JsonObject,
  imported: {
    readonly blobHash: string
    readonly format: string
    readonly width: number
    readonly height: number
  },
): JsonObject {
  return {
    ...current,
    fill: {
      kind: 'imageTexture',
      blobHash: imported.blobHash,
      format: imported.format,
      intrinsicWidth: imported.width,
      intrinsicHeight: imported.height,
      fit: 'fit',
      transform: {
        scale: 1, rotation: 0, offsetX: 0, offsetY: 0,
      },
      opacity: 1,
    },
  }
}
export function createContextActions(context: ContextActionsContext) {
  const precisionActions = createPrecisionActions(context)
  let textureResolver: TextureResourceResolver | undefined
  function resolver(): TextureResourceResolver | undefined {
    if (!context.props.textureBridge)
      return undefined
    textureResolver ??= new TextureResourceResolver({
      bridge: context.props.textureBridge,
      correlationId: () => crypto.randomUUID(),
    })
    return textureResolver
  }
  async function importTexture(): Promise<void> {
    const resources = resolver()
    if (!resources)
      return
    const imported = await resources.import()
    if (imported.kind !== 'imported')
      return
    const resource = resources.get(imported.blobHash)
    if (resource?.kind === 'ready') {
      context.textureImages.value = new Map(context.textureImages.value).set(imported.blobHash, resource.image)
    }
    if (resource?.kind !== 'ready') {
      context.reportResourceError('Texture is unavailable. Select the resource again.')
      return
    }
    context.applyTextureFill(importedShapePayload({}, imported).fill as JsonObject)
  }
  function removeTexture(): void {
    context.applyTextureFill({
      kind: 'none',
    })
  }
  async function resolveDocumentTextures(document: EditorDocumentV1): Promise<void> {
    const resources = resolver()
    if (!resources)
      return
    const images = new Map(context.textureImages.value)
    for (const blobHash of documentTextureHashes(document)) {
      const resource = await resources.resolve(blobHash)
      if (resource.kind === 'ready')
        images.set(blobHash, resource.image)
      else {
        images.delete(blobHash)
        context.reportResourceError('Texture is unavailable. Select the resource again.')
      }
    }
    context.textureImages.value = images
  }
  async function onContextAction(id: string): Promise<void> {
    if (await precisionActions(id)) return
    if (id === 'cropReset') {
      context.cropPreset.value = 'free'
      context.canvas.value?.resetCropDraft()
      return
    }
    if (id === 'cropApply')
      return context.canvas.value?.applyCropDraft()
    if (id === 'cropCancel')
      return context.canvas.value?.cancelCropDraft()
    if (id === 'importTexture') {
      try {
        await importTexture()
      } catch (error) {
        context.reportResourceError(error instanceof Error ? error.message : 'Texture import failed')
      }
      return
    }
    if (id === 'removeTexture')
      return removeTexture()
    if (id !== 'flipHorizontal' && id !== 'flipVertical')
      return
    const document = context.activeDocument.value
    if (!document || !context.props.documentSession)
      return
    context.props.documentSession.execute(createFlipCanvasCommand(document, id === 'flipHorizontal' ? 'horizontal' : 'vertical'))
  }
  return {
    onContextAction, resolveDocumentTextures,
  }
}
