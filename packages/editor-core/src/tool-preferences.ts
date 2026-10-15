import {
  parseDrawingToolPreferences,
  type DrawingToolPreferencesV2,
} from './drawing-preferences'
import type { JsonObject } from './document/types'

export interface ToolSettingsPreferencesV3 {
  readonly schemaVersion: 3
  readonly drawing: DrawingToolPreferencesV2
  /** Per-tool validated UI defaults; the adapter merges them against its typed defaults. */
  readonly settings: Readonly<Record<string, JsonObject>>
}
export function parseToolSettingsPreferences(value: unknown): ToolSettingsPreferencesV3 {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const current = record.schemaVersion === 3
  const settings: Record<string, JsonObject> = {}
  if (
    current &&
    record.settings &&
    typeof record.settings === 'object' &&
    !Array.isArray(record.settings)
  ) {
    for (const [key, item] of Object.entries(record.settings)) {
      if (
        ['text', 'callout', 'numberedMarker', 'precision', 'styles', 'marker'].includes(key) &&
        item &&
        typeof item === 'object' &&
        !Array.isArray(item)
      )
        settings[key] = item as JsonObject
    }
  }
  return {
    schemaVersion: 3,
    drawing: parseDrawingToolPreferences(current ? record.drawing : value),
    settings,
  }
}
