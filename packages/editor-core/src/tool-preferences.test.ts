import {
  expect,
  it,
} from 'vitest'
import { defaultDrawingToolPreferences } from './drawing-preferences'
import { parseToolSettingsPreferences } from './tool-preferences'
it('migrates v2 drawing defaults and recent colors without inventing text settings', () => {
  const drawing = defaultDrawingToolPreferences()
  expect(parseToolSettingsPreferences(drawing)).toEqual({
    schemaVersion: 3,
    drawing,
    settings: {},
  })
})
it('roundtrips independent tool settings and rejects unknown schemas', () => {
  const settings = {
    text: { fontSize: 24 },
    callout: { fontSize: 18 },
    numberedMarker: { fontSize: 16 },
  }
  const preferences = {
    schemaVersion: 3,
    drawing: defaultDrawingToolPreferences(),
    settings,
  }
  expect(parseToolSettingsPreferences(JSON.parse(JSON.stringify(preferences)))).toEqual(preferences)
  expect(parseToolSettingsPreferences({ schemaVersion: 99, settings })).toHaveProperty('settings', {})
})
