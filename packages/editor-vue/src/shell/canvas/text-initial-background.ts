import {
  calloutBackground,
  type TextBackground,
} from '@cute-screen/editor-renderer'
import type { EditableTextLayer } from './workspace-state'
export function initialTextBackground(
  existing: EditableTextLayer | undefined,
  fallback: TextBackground | null,
): TextBackground | null {
  if (existing?.kind === 'callout') return calloutBackground(existing.payload)
  if (existing?.kind === 'text') return existing.payload.background
  if (existing?.kind === 'numberedMarker') return { color: existing.payload.badge.color, padding: 0, radius: 0 }
  return fallback
}
