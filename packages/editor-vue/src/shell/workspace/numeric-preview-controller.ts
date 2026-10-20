import { layerSpaceDocument } from './layer-space'
import {
  applyEditorCommand,
  rebaseRulerLayer,
  rotateLayerTransform,
  constrainRulerTransform,
  rulerCanvasBounds,
  type EditorCommand,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import type {
  NumericPreviewService,
  NumericPreviewTarget,
} from '../ui/numeric-preview'
import type { TextFormattingPatch } from '../canvas/contracts'

export interface NumericPreviewContext {
  readonly document: () => EditorDocumentV1 | undefined
  readonly readOnly: () => boolean
  readonly inlineText: () => boolean
  readonly commands: (id: string, value: string) => readonly EditorCommand[]
  readonly inlinePatch: (id: string, value: string) => TextFormattingPatch | undefined
  readonly showDocument: (document: EditorDocumentV1 | undefined) => void
  readonly showText: (patch: TextFormattingPatch) => void
  readonly requestFrame: (callback: FrameRequestCallback) => number
  readonly cancelFrame: (handle: number) => void
}

/** A display-only projection. It never executes a session command or writes defaults. */
export class NumericPreviewController implements NumericPreviewService {
  readonly #context: NumericPreviewContext
  #owner: symbol | undefined
  #base: EditorDocumentV1 | undefined
  #pending: { target: NumericPreviewTarget; value: string } | undefined
  #frame: number | undefined
  #inline = false
  #revision = 0
  readonly #listeners = new Map<symbol, () => void>()

  constructor(context: NumericPreviewContext) {
    this.#context = context
  }

  isBlocked(): boolean {
    return this.#context.readOnly()
  }

  register(
    owner: symbol,
    invalidated: () => void,
  ): () => void {
    this.#listeners.set(owner, invalidated)
    return () => {
      this.#listeners.delete(owner)
    }
  }

  activate(owner: symbol): void {
    if (this.#context.readOnly()) return
    if (this.#owner !== owner) {
      const previous = this.#owner
      if (previous) {
        this.cancel(previous)
        this.#listeners.get(previous)?.()
      }
      this.#owner = owner
      this.#base = this.#context.document()
    }
  }

  preview(
    owner: symbol,
    target: NumericPreviewTarget,
    value: string,
  ): void {
    if (this.#context.readOnly()) return
    this.activate(owner)
    this.#pending = { target, value }
    if (this.#frame !== undefined) return
    this.#frame = this.#context.requestFrame(() => {
      this.#frame = undefined
      this.#render()
    })
  }

  cancel(owner?: symbol): void {
    if (owner !== undefined && owner !== this.#owner) return
    if (this.#frame !== undefined) this.#context.cancelFrame(this.#frame)
    this.#frame = undefined
    this.#pending = undefined
    // Invalid input can have a local draft without a rendered projection.
    // A context change must discard those drafts as well as the active gesture.
    const invalidated = owner === undefined ? [...this.#listeners.values()] : []
    this.#owner = undefined
    this.#base = undefined
    this.#context.showDocument(undefined)
    if (this.#inline) this.#context.showText({ revision: ++this.#revision, cancelPreview: true })
    this.#inline = false
    for (const invalidate of invalidated) invalidate()
  }

  #render(): void {
    const pending = this.#pending
    if (!pending || this.#context.readOnly()) return
    if (this.#base !== this.#context.document()) {
      this.cancel()
      return
    }
    const { target, value } = pending
    if (target.defaultsTool) return
    if (this.#context.inlineText() && !target.layerId) {
      const patch = this.#context.inlinePatch(target.id, value)
      if (patch) {
        this.#inline = true
        this.#context.showText(patch)
      }
      return
    }
    if (!this.#base) return
    const commands = target.layerId
      ? layerCommands(this.#base, target, Number(value))
      : this.#context.commands(target.id, value)
    const projected = commands.reduce(applyEditorCommand, this.#base)
    this.#context.showDocument(projected)
  }
}

function layerCommands(
  document: EditorDocumentV1,
  target: NumericPreviewTarget,
  value: number,
): readonly EditorCommand[] {
  const layer = document.layers.find((candidate) => candidate.id === target.layerId)
  if (
    !layer ||
    layer.locked ||
    !Number.isFinite(value)
  ) return []
  if (target.id === 'layerOpacity') {
    if (
      layer.kind === 'text' ||
      layer.kind === 'callout' ||
      layer.kind === 'numberedMarker'
    ) return []
    return [{ type: 'updateLayer', before: layer, after: { ...layer, opacity: value / 100 } }]
  }
  if (target.id !== 'rotation') return []
  document = layerSpaceDocument(document, layer)
  const transform = rotateLayerTransform(layer, value)
  const after = layer.kind === 'ruler'
    ? rebaseRulerLayer({
        ...layer,
        transform: constrainRulerTransform(layer, transform, rulerCanvasBounds(document), document.canvas),
      }, layer.payload, document.crop ?? document.canvas)
    : { ...layer, transform }
  return [{ type: 'updateLayer', before: layer, after }]
}
