import { isGradientLayer } from '@cute-screen/editor-renderer'
import type {
  EditorDocumentV1,
  LayerNode,
} from '@cute-screen/editor-renderer'
import type { CanvasViewportProps } from './contracts'
import type { CanvasGesture } from './workspace-state'

export function requiresScenePreview(layer: LayerNode | undefined): boolean {
  // Image nodes need decoded resources and their original ordered scene slot;
  // the lightweight overlay intentionally does not render them.
  return Boolean(isGradientLayer(layer) || layer && ['emoji', 'image', 'censor', 'spotlight', 'loupe', 'marker'].includes(layer.kind))
}

export interface SceneDocumentContext {
  readonly props: CanvasViewportProps
  readonly gesture: () => CanvasGesture
  readonly previewLayer: () => LayerNode | undefined
  readonly moveLoupeSource: (
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
    point: { readonly x: number; readonly y: number },
  ) => Extract<LayerNode, { readonly kind: 'loupe' }>
}

export class SceneDocumentController {
  readonly #context: SceneDocumentContext

  constructor(context: SceneDocumentContext) {
    this.#context = context
  }

  documentForScene(): EditorDocumentV1 | undefined {
    const document = this.#context.props.document
    if (!document) return undefined
    const gesture = this.#context.gesture()
    if (
      gesture?.kind === 'move' &&
      gesture.nodeIds &&
      gesture.nodeIds.length > 1
    ) {
      return { ...document, layers: document.layers.map((layer) => gesture.nodeIds!.includes(layer.id) ? {
        ...layer, transform: { ...layer.transform,
          translateX: layer.transform.translateX + (gesture.current.x - gesture.start.x),
          translateY: layer.transform.translateY + (gesture.current.y - gesture.start.y),
        },
      } : layer) }
    }
    if (gesture?.kind === 'loupeSource') {
      return {
        ...document,
        layers: document.layers.map((layer) =>
          layer.id === gesture.id && layer.kind === 'loupe'
            ? this.#context.moveLoupeSource(layer, gesture.current)
            : layer),
      }
    }
    const preview = this.#context.previewLayer()
    if (
      preview &&
      (requiresScenePreview(preview) ||
        this.#context.props.compositionDocument)
    ) {
      return {
        ...document,
        layers: document.layers.map((layer) => (layer.id === preview.id ? preview : layer)),
      }
    }
    const hiddenLayerId = transientLayerId(gesture)
    if (!hiddenLayerId) return document
    return {
      ...document,
      layers: document.layers.filter((layer) => layer.id !== hiddenLayerId),
    }
  }
}

function transientLayerId(gesture: CanvasGesture): string | undefined {
  if (!gesture || !('id' in gesture)) return undefined
  if (gesture.kind === 'calloutHandle' && gesture.removal) return undefined
  return gesture.kind === 'move' ||
    gesture.kind === 'resize' ||
    gesture.kind === 'intrinsicResize' ||
    gesture.kind === 'rotate' ||
    gesture.kind === 'arrowHandle' ||
    gesture.kind === 'calloutHandle'
    ? gesture.id
    : undefined
}
