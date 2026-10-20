import type {
  EditorDocument,
  Point,
} from '../document/types'
import { hitTestDocument } from '../hit-test'
import { resolveCompositionLayout } from './layout'

export function compositionInteractionSpace(
  document: EditorDocument,
  point: Point,
  options: { selecting?: boolean; preserveSelection?: boolean; currentSpace?: 'content' | 'card' } = {},
): 'content' | 'card' {
  if (!document.presentation.composition) return 'content'
  if (options.selecting && options.preserveSelection) return options.currentSpace ?? 'content'
  const layout = resolveCompositionLayout(document)
  if (options.selecting && hitTestDocument({ ...document, crop: null,
    canvas: { width: layout.width, height: layout.height },
    layers: document.layers.filter((layer) => layer.space === 'card') }, point)) return 'card'
  const { content, screen } = layout
  return point.x >= Math.max(content.x, screen.x) && point.y >= Math.max(content.y, screen.y)
    && point.x <= Math.min(content.x + content.width, screen.x + screen.width)
    && point.y <= Math.min(content.y + content.height, screen.y + screen.height) ? 'content' : 'card'
}
