import { describe, expect, it } from 'vitest'

import {
  defaultDrawingToolPreferences,
  parseDrawingToolPreferences,
  rememberDrawingColor,
} from './drawing-preferences'

describe('DrawingToolPreferencesV1', () => {
  it('recovers safe session defaults from damaged persisted input', () => {
    expect(
      parseDrawingToolPreferences({
        schemaVersion: 1,
        defaults: null,
        recentColors: ['bad'],
      }),
    ).toMatchObject({
      schemaVersion: 1,
      defaults: { pencil: { brush: 'pen', width: 3 } },
      recentColors: [],
    })
  })

  it('keeps at most twelve unique recent colors', () => {
    let preferences = defaultDrawingToolPreferences()
    for (let index = 0; index < 14; index += 1) {
      preferences = rememberDrawingColor(preferences, {
        red: index / 14,
        green: 0,
        blue: 0,
        alpha: 1,
      })
    }
    expect(preferences.recentColors).toHaveLength(12)
    expect(preferences.recentColors[0]).toMatchObject({ red: 13 / 14 })
  })
})
