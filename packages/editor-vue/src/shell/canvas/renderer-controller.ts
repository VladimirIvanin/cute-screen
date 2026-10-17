import { loadDocumentTextFonts } from '../../text-fonts'
import type {
  ComputedRef,
  Ref,
} from 'vue'
import {
  Canvas2DRenderer,
  createDocumentRenderScene,
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
  readonly invalidateOverlay: () => void
}

export class CanvasRendererController {
  private readonly highlighterPreview = new HighlighterPreview()
  private renderer: Canvas2DRenderer | undefined
  private overlayTarget: HTMLCanvasElement | undefined
  private initialization: Promise<Canvas2DRenderer | undefined> | undefined
  private sceneReady = false
  private revision = 0
  private mounted = false
  private drawing: Promise<void> = Promise.resolve()
  private resources = new Map<string, { readonly key: string; readonly resource: ImageResource }>()

  constructor(private readonly context: RendererControllerContext) {}

  get overlaySurface(): HTMLCanvasElement | undefined {
    return this.overlayTarget
  }

  mount(): void {
    this.mounted = true
  }

  dispose(): void {
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

  private setCommittedScene(runtime: Canvas2DRenderer): void {
    const { props, editingText } = this.context
    const document = this.context.documentForScene()
    if (!document) return
    runtime.setPreviewScale(scenePreviewScale(document.canvas, (props.zoom ?? 100) / 100, window.devicePixelRatio || 1))
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
        nodes: documentScene.nodes.filter((candidate) => !hiddenNodeIds.has(candidate.id)),
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

  async exportPng(): Promise<Uint8Array> {
    await this.waitForRender()
    const document = this.context.props.document
    const runtime = this.renderer
    if (
      !runtime ||
      !document ||
      !this.sceneReady
    ) throw new Error('The rendered result is not ready')
    // Crop editing and display density affect preview only. Export always uses
    // committed document bounds and excludes transient text/gesture overlays.
    runtime.setScene(createDocumentRenderScene(document))
    try {
      return await runtime.exportPng({ scale: 1 })
    } finally {
      if (this.renderer === runtime) this.setCommittedScene(runtime)
    }
  }

  private async drawFrame(): Promise<void> {
    const revision = ++this.revision
    const { scene, props, rendererError } = this.context
    const bounds = this.context.outputBounds.value
    if (
      !scene.value ||
      !props.canvas ||
      !bounds
    ) return
    rendererError.value = undefined
    if (!props.document) {
      scene.value.width = Math.max(1, Math.round(bounds.width))
      scene.value.height = Math.max(1, Math.round(bounds.height))
      scene.value.getContext('2d')?.clearRect(0, 0, scene.value.width, scene.value.height)
      this.context.invalidateOverlay()
      return
    }
    let readyDocumentId: string | undefined
    try {
      await loadDocumentTextFonts(this.context.documentForScene() ?? props.document)
      const runtime = await this.ensureRenderer()
      if (
        !runtime ||
        !this.mounted ||
        revision !== this.revision
      ) return
      if (!(await this.syncImageResources(runtime, revision))) return
      this.setCommittedScene(runtime)
      this.highlighterPreview.invalidate()
      runtime.render(['scene'])
      readyDocumentId = props.document.id
    } catch (error) {
      if (revision !== this.revision) return
      this.renderer?.dispose()
      this.renderer = undefined
      this.sceneReady = false
      this.resources = new Map()
      rendererError.value = error instanceof Error ? error.message : String(error)
    }
    if (this.mounted && revision === this.revision) {
      this.context.invalidateOverlay()
      if (readyDocumentId) this.context.emit('frameReady', readyDocumentId)
    }
  }

  renderCommittedSceneForGesture(): void {
    if (this.renderer && this.sceneReady) {
      this.setCommittedScene(this.renderer)
      this.renderer.render(['scene'])
    }
    if (this.mounted) this.context.invalidateOverlay()
  }

  invalidateGesturePreview(): void {
    if (requiresScenePreview(this.context.previewLayer()) || this.context.gestureRequiresScenePreview?.()) {
      this.renderCommittedSceneForGesture()
    } else {
      this.context.invalidateOverlay()
    }
  }

  renderOverlay(nodes: readonly RenderNode[]): boolean {
    if (!this.renderer || !this.sceneReady) return false
    this.renderer.setOverlay(nodes)
    this.renderer.render(['overlay'])
    return true
  }

  renderHighlighterDraft(layer: LayerNode | undefined): void {
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
