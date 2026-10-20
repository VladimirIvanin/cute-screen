import { mergeCompositionView } from './composition-view'
import { loadDocumentTextFonts } from '../../text-fonts'
import { loadEmojiResource } from '../../emoji/resources'
import type {
  ComputedRef,
  Ref,
} from 'vue'
import {
  compositionBlobHashes,
  Canvas2DRenderer,
  prepareCompositionScene,
  resolveCompositionLayout,
  createDocumentRenderScene,
  emojiResourceId,
  createRenderSceneSnapshot,
  type EditorDocumentV1,
  type ImageResource,
  type LayerNode,
} from '@cute-screen/editor-renderer'
import type {
  CanvasViewportProps,
  ViewportOutputBounds,
} from './contracts'
import type { CanvasViewportEmit } from './contracts'
import type { createCanvasWorkspaceState } from './workspace-state'
import { HighlighterPreview } from './highlighter-preview'
import { requiresScenePreview } from './scene-document-controller'
import { scenePreviewScale } from './scene-preview-scale'

type EditingText = ReturnType<typeof createCanvasWorkspaceState>['editingText']
type RenderNode = ReturnType<typeof createDocumentRenderScene>['nodes'][number]

export interface RendererControllerContext {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly scene: Ref<HTMLCanvasElement | undefined>
  readonly overlay: Ref<HTMLCanvasElement | undefined>
  readonly rendererError: Ref<string | undefined>
  readonly editingText: EditingText
  readonly outputBounds: ComputedRef<ViewportOutputBounds | undefined>
  readonly documentForScene: () => EditorDocumentV1 | undefined
  readonly previewLayer: () => LayerNode | undefined
  readonly gestureRequiresScenePreview?: () => boolean
  readonly isInteracting?: () => boolean
  readonly invalidateOverlay: () => void
}

export class CanvasRendererController {
  private readonly highlighterPreview = new HighlighterPreview()
  private renderer: Canvas2DRenderer | undefined
  private overlayTarget: HTMLCanvasElement | undefined
  private initialization: Promise<Canvas2DRenderer | undefined> | undefined
  private preparation: AbortController | undefined
  private sceneReady = false
  private revision = 0
  private mounted = false
  private drawing: Promise<void> = Promise.resolve()
  private frame: number | undefined
  private finishFrame: (() => void) | undefined
  private gestureDrawing: Promise<void> | undefined
  private gesturePending = false
  private documentId: string | undefined
  private exporting: Promise<void> | undefined
  private resources = new Map<string, { readonly key: string; readonly resource: ImageResource }>()

  constructor(private readonly context: RendererControllerContext) {}

  get overlaySurface(): HTMLCanvasElement | undefined {
    return this.overlayTarget
  }

  mount(): void {
    this.mounted = true
  }

  dispose(): void {
    this.cancelScheduledFrame()
    this.preparation?.abort()
    this.highlighterPreview.invalidate()
    this.mounted = false
    this.revision += 1
    for (const { resource } of this.resources.values()) resource.dispose()
    this.resources.clear()
    this.renderer?.dispose()
    this.renderer = undefined
    this.overlayTarget = undefined
    this.sceneReady = false
  }

  private async ensureRenderer(): Promise<Canvas2DRenderer | undefined> {
    const { scene, overlay, props } = this.context
    if (
      !scene.value ||
      !overlay.value ||
      !props.canvas
    ) return undefined
    if (this.renderer) return this.renderer
    if (this.initialization) return this.initialization
    const next = new Canvas2DRenderer()
    // Annotation previews share scene density; selection chrome has its own
    // viewport-sized display-resolution surface.
    const overlayTarget = document.createElement('canvas')
    const initialization = (async () => {
      await next.initialize({
        scene: scene.value!,
        overlay: overlayTarget,
        dpr: window.devicePixelRatio || 1,
        correlationId: 'editor-viewport',
      })
      if (!this.mounted) {
        next.dispose()
        return undefined
      }
      this.renderer = next
      this.overlayTarget = overlayTarget
      this.sceneReady = false
      return next
    })()
    this.initialization = initialization
    try {
      return await initialization
    } catch (error) {
      if (this.renderer === next) this.renderer = undefined
      this.sceneReady = false
      next.dispose()
      throw error
    } finally {
      if (this.initialization === initialization) this.initialization = undefined
    }
  }

  private committedDensity(document: EditorDocumentV1): number {
    const composition = document.presentation.composition ? resolveCompositionLayout(document) : undefined
    const contentScale = this.context.props.compositionDocument && this.context.props.compositionSpace !== 'card'
      ? composition?.scale ?? 1 : 1
    const density = (this.context.props.zoom ?? 100) / 100 / contentScale * (window.devicePixelRatio || 1)
    const nativeDensity = scenePreviewScale(composition ?? document.canvas,
      (this.context.props.zoom ?? 100) / 100 / contentScale, window.devicePixelRatio || 1)
    // Appearance can enlarge a 4K/8K source far beyond the visible viewport.
    // Keep that preview at display density; export prepares its own full-size resources.
    return composition ? Math.max(0.01, Math.min(density, nativeDensity)) : nativeDensity
  }

  private setCommittedScene(
    runtime: Canvas2DRenderer,
    preparedDocument?: EditorDocumentV1,
  ): void {
    const { props, editingText } = this.context
    const document = preparedDocument ?? mergeCompositionView(props.compositionDocument,
      this.context.documentForScene(),
      props.compositionSpace)
    if (!document) return
    runtime.setPreviewScale(this.committedDensity(document))
    const documentScene = createDocumentRenderScene(
      (props.activeTool === 'crop' || props.quickFrameMode) && document.crop ? { ...document, crop: null } : document,
    )
    const editing = editingText.value
    if (!editing?.existing) {
      runtime.setScene(documentScene)
      this.sceneReady = true
      return
    }
    const hiddenNodeIds =
      editing.existing.kind === 'text'
        ? new Set([editing.id, `${editing.id}:background`])
        : editing.existing.kind === 'callout'
          ? new Set([`${editing.id}:text`, `${editing.id}:background`])
          : new Set([`${editing.id}:caption`])
    runtime.setScene(
      createRenderSceneSnapshot({
        width: documentScene.width,
        height: documentScene.height,
        outputBounds: documentScene.outputBounds,
        nodes: hideEditingNodes(documentScene.nodes, hiddenNodeIds),
      }),
    )
    this.sceneReady = true
  }

  private async syncImageResources(
    runtime: Canvas2DRenderer,
    revision: number,
  ): Promise<boolean> {
    const { props } = this.context
    const layer = props.imageLayer
    const inputs = new Map<string, HTMLImageElement>([
      ...(layer && props.image ? ([[layer.payload.blobHash, props.image]] as const) : []),
      ...(props.textureImages ?? new Map()),
    ])
    const emojiIds = new Set((props.compositionDocument ?? props.document)!.layers
      .filter((layer) => layer.kind === 'emoji')
      .map((layer) => emojiResourceId(layer.payload.asset)))
    const emojiImages = await Promise.all([...emojiIds].map(async (id) => [id, await loadEmojiResource(id)] as const))
    if (!this.mounted || revision !== this.revision) return false
    for (const [id, image] of emojiImages) inputs.set(id, image)
    for (const [id, image] of inputs) {
      const key = `${id}:${image.currentSrc || image.src}`
      if (this.resources.get(id)?.key === key) continue
      this.resources.get(id)?.resource.dispose()
      const resource = await runtime.createImageResource({
        id,
        width: image.naturalWidth,
        height: image.naturalHeight,
        source: image,
      })
      if (!this.mounted || revision !== this.revision) {
        resource.dispose()
        return false
      }
      this.resources.set(id, { key, resource })
    }
    for (const [id, resource] of this.resources) {
      if (inputs.has(id)) continue
      resource.resource.dispose()
      this.resources.delete(id)
    }
    return true
  }

  drawDocument(): Promise<void> {
    if (this.context.isInteracting?.() && this.sceneReady) {
      this.renderCommittedSceneForGesture()
      return this.drawing
    }
    this.gesturePending = false
    this.cancelScheduledFrame()
    const drawing = this.drawFrame()
    this.drawing = drawing
    return drawing
  }

  async waitForRender(): Promise<void> {
    let drawing: Promise<void>
    do {
      drawing = this.drawing
      await drawing
    } while (drawing !== this.drawing)
    if (this.context.rendererError.value) throw new Error(this.context.rendererError.value)
  }

  async exportPng(options?: {
    readonly signal?: AbortSignal
    readonly onProgress?: (fraction: number) => void
  }): Promise<Uint8Array> {
    await this.waitForRender()
    await this.exporting
    const document = this.context.props.exportDocument
      ?? this.context.props.compositionDocument
      ?? this.context.props.document
    const runtime = this.renderer
    if (
      !runtime ||
      !document ||
      !this.sceneReady
    ) throw new Error('The rendered result is not ready')
    // Crop editing and display density affect preview only. Export always uses
    // committed document bounds and excludes transient text/gesture overlays.
    let unlock!: () => void
    const exporting = new Promise<void>((resolve) => {
      unlock = resolve
    })
    this.exporting = exporting
    try {
      await prepareCompositionScene(createDocumentRenderScene(document), 1, options?.signal, options?.onProgress)
      runtime.setScene(createDocumentRenderScene(document))
      return await runtime.exportPng({ scale: 1, ...(options?.signal ? { signal: options.signal } : {}) })
    } finally {
      if (this.renderer === runtime) this.setCommittedScene(runtime)
      if (this.exporting === exporting) this.exporting = undefined
      unlock()
    }
  }

  private isCurrent(revision: number): boolean {
    return this.mounted && revision === this.revision
  }

  private async drawFrame(announceReady = true): Promise<void> {
    this.preparation?.abort()
    const revision = ++this.revision
    await this.exporting
    if (!this.mounted || revision !== this.revision) return
    const { scene, props, rendererError } = this.context
    const bounds = this.context.outputBounds.value
    if (
      !scene.value ||
      !props.canvas ||
      !bounds
    ) return
    rendererError.value = undefined
    if (!props.document) {
      this.renderer?.clearEffectCache()
      this.sceneReady = false
      scene.value.width = Math.max(1, Math.round(bounds.width))
      scene.value.height = Math.max(1, Math.round(bounds.height))
      scene.value.getContext('2d')?.clearRect(0, 0, scene.value.width, scene.value.height)
      this.context.invalidateOverlay()
      return
    }
    let readyDocumentId: string | undefined
    try {
      await loadDocumentTextFonts(props.compositionDocument ?? this.context.documentForScene() ?? props.document)
      const runtime = await this.ensureRenderer()
      if (
        !runtime ||
        !this.isCurrent(revision)
      ) return
      if (!(await this.prepareFrame(runtime, revision))) return
      readyDocumentId = props.document.id
    } catch (error) {
      if (
        !this.isCurrent(revision) ||
        isCancelled(error)
      ) return
      this.renderer?.dispose()
      this.renderer = undefined
      this.sceneReady = false
      this.resources = new Map()
      rendererError.value = error instanceof Error ? error.message : String(error)
    }
    if (this.isCurrent(revision)) {
      this.context.invalidateOverlay()
      if (readyDocumentId && announceReady) this.context.emit('frameReady', readyDocumentId)
    }
  }

  private async prepareFrame(
    runtime: Canvas2DRenderer,
    revision: number,
  ): Promise<boolean> {
    const { props } = this.context
    if (!(await this.syncImageResources(runtime, revision))) return false
    if (this.documentId !== props.document!.id) {
      runtime.clearEffectCache()
      this.documentId = props.document!.id
    }
    runtime.setRenderMode(this.context.isInteracting?.() ? 'interactive' : 'settled')
    const preparedDocument = await this.prepareScene(props)
    if (!this.mounted || revision !== this.revision) return false
    this.setCommittedScene(runtime, preparedDocument)
    await runtime.prepareEffects({ signal: this.preparation!.signal })
    if (!this.mounted || revision !== this.revision) return false
    this.highlighterPreview.invalidate()
    runtime.render(['scene'])
    return true
  }

  private async prepareScene(props: CanvasViewportProps): Promise<EditorDocumentV1> {
    const full = props.compositionDocument ?? props.document!
    if (compositionBlobHashes(full.presentation.composition).some((hash) => !this.resources.has(hash))) {
      throw new Error('Appearance image is unavailable. Restore the material or choose another image.')
    }
    this.preparation?.abort()
    this.preparation = new AbortController()
    const prepared = mergeCompositionView(
      props.compositionDocument,
      this.context.documentForScene(),
      props.compositionSpace,
    )!
    await prepareCompositionScene(
      createDocumentRenderScene(prepared),
      this.committedDensity(prepared),
      this.preparation.signal,
    )
    return prepared
  }

  renderCommittedSceneForGesture(): void {
    if (!this.mounted || this.frame !== undefined) return
    if (this.gestureDrawing) {
      this.gesturePending = true
      return
    }
    this.drawing = new Promise<void>((resolve) => {
      this.finishFrame = resolve
      this.frame = requestAnimationFrame(() => {
        this.frame = undefined
        this.finishFrame = undefined
        const drawing = this.drawFrame(false)
        this.gestureDrawing = drawing
        this.drawing = drawing
        void drawing.finally(() => {
          if (this.gestureDrawing === drawing) this.gestureDrawing = undefined
          resolve()
          if (this.gesturePending && this.mounted) {
            this.gesturePending = false
            this.renderCommittedSceneForGesture()
          }
        })
      })
    })
    if (this.mounted) this.context.invalidateOverlay()
  }

  private cancelScheduledFrame(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    this.frame = undefined
    this.finishFrame?.()
    this.finishFrame = undefined
  }

  invalidateGesturePreview(): void {
    if (
      this.context.props.compositionDocument ||
      requiresScenePreview(this.context.previewLayer()) ||
      this.context.gestureRequiresScenePreview?.()
    ) {
      this.renderCommittedSceneForGesture()
    } else {
      this.context.invalidateOverlay()
    }
  }

  renderOverlay(nodes: readonly RenderNode[]): boolean {
    if (!this.renderer || !this.sceneReady) return false
    if (this.context.props.compositionDocument) return true
    this.renderer.setOverlay(nodes)
    this.renderer.render(['overlay'])
    return true
  }

  renderHighlighterDraft(layer: LayerNode | undefined): void {
    if (this.context.props.compositionDocument) return
    const scene = this.context.scene.value
    const bounds = this.context.outputBounds.value
    const document = this.context.props.document
    if (
      scene &&
      bounds &&
      document &&
      this.sceneReady
    ) this.highlighterPreview.draw(
      scene,
      layer,
      bounds,
      document,
      scenePreviewScale(document.canvas, (this.context.props.zoom ?? 100) / 100, window.devicePixelRatio || 1),
    )
  }
}

function hideEditingNodes(
  nodes: readonly RenderNode[],
  ids: ReadonlySet<string>,
): readonly RenderNode[] {
  return nodes.filter((node) => !ids.has(node.id)).map((node) => node.kind === 'group'
    ? { ...node, scene: createRenderSceneSnapshot({
        ...node.scene, nodes: hideEditingNodes(node.scene.nodes, ids),
      }) } : node)
}

function isCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
