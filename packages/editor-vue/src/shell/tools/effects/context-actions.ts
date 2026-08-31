import type { Ref, ShallowRef } from 'vue'
import {
  createFlipCanvasCommand,
  type CropPreset,
  type DrawingDefaults,
  type DrawingToolPreferencesV2,
  type EditorDocumentV1,
  type JsonObject,
} from '@cute-screen/editor-renderer'
import { TextureResourceResolver } from '../../../texture-fill'
import type { ResolvedEditorShellProps } from '../../contracts'
import type { CanvasViewportExpose } from '../../canvas/contracts'
import type { DrawingLayerNode } from '../drawing-schema'

export interface ContextActionsContext {
  readonly props: ResolvedEditorShellProps
  readonly canvas: Ref<CanvasViewportExpose | undefined>
  readonly cropPreset: Ref<CropPreset>
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly textureImages: Ref<ReadonlyMap<string, HTMLImageElement>>
  readonly drawingDefaults: Ref<DrawingDefaults>
  readonly drawingPreferences: ShallowRef<DrawingToolPreferencesV2>
  readonly selectedDrawingLayer: () => DrawingLayerNode | undefined
  readonly saveDrawingPreferences: (value: DrawingToolPreferencesV2) => void
}

function textureBlobHash(fill: unknown): string | undefined {
  if (!fill || typeof fill !== 'object') return undefined
  const candidate = fill as Record<string, unknown>
  return candidate.kind === 'imageTexture' &&
    typeof candidate.blobHash === 'string'
    ? candidate.blobHash
    : undefined
}

function documentTextureHashes(document: EditorDocumentV1): readonly string[] {
  return document.layers.flatMap((layer) => {
    if (layer.kind === 'image' && layer.payload.role === 'content') {
      return [layer.payload.blobHash]
    }
    if (layer.kind !== 'shape') return []
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
      transform: { scale: 1, rotation: 0, offsetX: 0, offsetY: 0 },
      opacity: 1,
    },
  }
}

export function createContextActions(context: ContextActionsContext) {
  let textureResolver: TextureResourceResolver | undefined
  function resolver(): TextureResourceResolver | undefined {
    if (!context.props.textureBridge) return undefined
    textureResolver ??= new TextureResourceResolver({
      bridge: context.props.textureBridge,
      correlationId: () => crypto.randomUUID(),
    })
    return textureResolver
  }
  async function importTexture(): Promise<void> {
    const resources = resolver()
    if (!resources) return
    const imported = await resources.import()
    if (imported.kind !== 'imported') return
    const resource = resources.get(imported.blobHash)
    if (resource?.kind === 'ready') {
      context.textureImages.value = new Map(context.textureImages.value).set(
        imported.blobHash,
        resource.image,
      )
    }
    const selected = context.selectedDrawingLayer()
    const target = selected?.kind === 'shape' ? selected : undefined
    const current = target
      ? target.payload
      : context.drawingDefaults.value.shape
    const payload = importedShapePayload(current, imported)
    if (target) {
      if (!context.props.documentSession || target.locked) return
      context.props.documentSession.execute({
        type: 'updateLayer',
        before: target,
        after: { ...target, payload },
      })
      return
    }
    context.drawingDefaults.value = {
      ...context.drawingDefaults.value,
      shape: payload,
    }
    context.drawingPreferences.value = {
      ...context.drawingPreferences.value,
      defaults: context.drawingDefaults.value,
    }
    context.saveDrawingPreferences(context.drawingPreferences.value)
  }
  function removeTexture(): void {
    const selected = context.selectedDrawingLayer()
    if (
      selected?.kind !== 'shape' ||
      !context.props.documentSession ||
      selected.locked
    ) {
      return
    }
    const fill = selected.payload.fill as Record<string, unknown> | undefined
    if (fill?.kind !== 'imageTexture') return
    const blobHash = String(fill.blobHash)
    textureResolver?.remove(blobHash)
    const images = new Map(context.textureImages.value)
    images.delete(blobHash)
    context.textureImages.value = images
    context.props.documentSession.execute({
      type: 'updateLayer',
      before: selected,
      after: {
        ...selected,
        payload: { ...selected.payload, fill: { kind: 'none' } },
      },
    })
  }
  async function resolveDocumentTextures(
    document: EditorDocumentV1,
  ): Promise<void> {
    const resources = resolver()
    if (!resources) return
    const images = new Map(context.textureImages.value)
    for (const blobHash of documentTextureHashes(document)) {
      const resource = await resources.resolve(blobHash)
      if (resource.kind === 'ready') images.set(blobHash, resource.image)
      else images.delete(blobHash)
    }
    context.textureImages.value = images
  }
  async function onContextAction(id: string): Promise<void> {
    if (id === 'cropReset') {
      context.cropPreset.value = 'free'
      context.canvas.value?.resetCropDraft()
      return
    }
    if (id === 'cropApply') return context.canvas.value?.applyCropDraft()
    if (id === 'cropCancel') return context.canvas.value?.cancelCropDraft()
    if (id === 'importTexture') return importTexture()
    if (id === 'removeTexture') return removeTexture()
    if (id !== 'flipHorizontal' && id !== 'flipVertical') return
    const document = context.activeDocument.value
    if (!document || !context.props.documentSession) return
    context.props.documentSession.execute(
      createFlipCanvasCommand(
        document,
        id === 'flipHorizontal' ? 'horizontal' : 'vertical',
      ),
    )
  }
  return { onContextAction, resolveDocumentTextures }
}
