import type {
  EditorDocumentV1,
  PencilLayer,
} from '../document/types'
import type { EditorCommand } from './types'
import { rebaseFreehandLayer } from '../tools/freehand'

export function migrateExpressiveBrush(layer: PencilLayer): PencilLayer {
  const smoothing = layer.payload.smoothing
  const correction = typeof smoothing === 'number'
    && Number.isFinite(smoothing)
    && smoothing >= 0
    && smoothing <= 1 ? smoothing : .65
  return rebaseFreehandLayer({
    ...layer,
    payload: {
      ...layer.payload,
      brush: 'stabilized',
      smoothing: correction,
      strokeVersion: layer.payload.strokeVersion === 3 ? 3 : 2,
      pressureMode: layer.payload.pressureMode ?? 'simulated',
    },
  })
}

export function createExpressiveBrushMigrationCommand(
  document: EditorDocumentV1,
): Extract<EditorCommand, { type: 'migrateExpressiveBrushes' }> | null {
  const changes = document.layers.flatMap((layer) => layer.kind === 'pencil' && layer.payload.brush === 'brush'
    ? [{ before: layer, after: migrateExpressiveBrush(layer) }] : [])
  return changes.length ? { type: 'migrateExpressiveBrushes', changes } : null
}
