import { describe, expect, it } from 'vitest'

import {
  defaultDrawingToolPreferences,
  parseDrawingToolPreferences,
  rememberDrawingColor,
} from './drawing-preferences'
import { createDrawingLayer } from './drawing'
import { parseEditorDocument, serializeEditorDocument } from './document/codec'
import type { EditorDocumentV1 } from './document/types'

const documentId = '019c1f62-058e-7000-8000-0000000000f0'
const arrowId = '019c1f62-058e-7000-8000-0000000000f1'

function documentWithRecoveredArrow(
  preferences: ReturnType<typeof parseDrawingToolPreferences>,
): EditorDocumentV1 {
  const arrow = createDrawingLayer({
    id: arrowId,
    tool: 'arrow',
    start: { x: 20, y: 20 },
    end: { x: 80, y: 40 },
    defaults: preferences.defaults,
  })
  if (!arrow || arrow.kind !== 'arrow') throw new Error('expected arrow')
  return {
    schemaVersion: 6,
    id: documentId,
    source: {
      blobHash: 'a'.repeat(64),
      format: 'png',
      mimeType: 'image/png',
      width: 100,
      height: 100,
      orientationApplied: true,
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas: { width: 100, height: 100 },
    crop: null,
    layers: [arrow],
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  }
}

describe('DrawingToolPreferencesV2', () => {
  it('migrates v1 caps while retaining legacy arrow appearance settings', () => {
    const parsed = parseDrawingToolPreferences({
      schemaVersion: 1,
      defaults: {
        arrow: {
          path: 'quadratic',
          stroke: {
            color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 0.4 },
            width: 3,
            style: 'dotted',
            cap: 'round',
            join: 'round',
          },
          startCap: 'chevron',
          endCap: 'triangle',
          layerOpacity: 0.6,
          blendMode: 'overlay',
        },
        shape: {},
        pencil: {},
        marker: {},
      },
      recentColors: [],
    })

    expect(parsed).toMatchObject({
      schemaVersion: 2,
      defaults: {
        arrow: {
          path: 'quadratic',
          stroke: { width: 3, style: 'dotted' },
          startCap: 'lineArrow',
          endCap: 'solidArrow',
          layerOpacity: 0.6,
          blendMode: 'overlay',
        },
      },
    })
    const arrow = createDrawingLayer({
      id: arrowId,
      tool: 'arrow',
      start: { x: 20, y: 20 },
      end: { x: 80, y: 40 },
      defaults: parsed.defaults,
    })
    expect(arrow).toMatchObject({
      kind: 'arrow',
      opacity: 0.6,
      blendMode: 'overlay',
      payload: {
        path: 'quadratic',
        stroke: { width: 3, style: 'dotted' },
        startCap: 'lineArrow',
        endCap: 'solidArrow',
      },
    })
  })

  it('accepts a v2 elbow contract and recovers only a malformed arrow', () => {
    expect(
      parseDrawingToolPreferences({
        schemaVersion: 2,
        defaults: {
          arrow: {
            ...defaultDrawingToolPreferences().defaults.arrow,
            path: 'elbow',
            elbow: { axis: 'y', offset: 12 },
            startCap: 'diamond',
            endCap: 'circle',
          },
        },
        recentColors: ['bad'],
      }),
    ).toMatchObject({
      schemaVersion: 2,
      defaults: {
        arrow: {
          path: 'elbow',
          elbow: { axis: 'y', offset: 12 },
          startCap: 'diamond',
          endCap: 'circle',
        },
        pencil: { brush: 'pen', width: 3 },
      },
      recentColors: [],
    })

    expect(
      parseDrawingToolPreferences({
        schemaVersion: 2,
        defaults: { arrow: { path: 'elbow', elbow: { axis: 'z' } } },
        recentColors: [],
      }).defaults.arrow,
    ).toEqual(defaultDrawingToolPreferences().defaults.arrow)
  })

  it.each([
    ['v1 zero width', 1, { width: 0 }],
    ['v1 non-number width', 1, { width: 'wide' }],
    ['v1 invalid style', 1, { style: 'zigzag' }],
    [
      'v2 invalid colour',
      2,
      { color: { red: 2, green: 0, blue: 0, alpha: 1 } },
    ],
    ['v2 invalid cap', 2, { cap: 'triangle' }],
    ['v2 invalid join', 2, { join: 'curve' }],
  ] as const)(
    'recovers a corrupt %s stroke and creates a serializable Arrow',
    (_name, schemaVersion, strokePatch) => {
      const fallback = defaultDrawingToolPreferences().defaults.arrow
      const fallbackStroke = fallback.stroke as Record<string, unknown>
      const parsed = parseDrawingToolPreferences({
        schemaVersion,
        defaults: {
          arrow: {
            path: 'straight',
            stroke: { ...fallbackStroke, ...strokePatch },
            startCap: 'none',
            endCap: 'solidArrow',
          },
        },
        recentColors: [],
      })

      expect(parsed.defaults.arrow).toEqual(fallback)
      const recovered = documentWithRecoveredArrow(parsed)
      expect(
        parseEditorDocument(serializeEditorDocument(recovered)),
      ).toMatchObject({ kind: 'editable' })
    },
  )

  it.each([
    [1, { path: 'loop' }],
    [2, { path: 'elbow', elbow: { axis: 'z', offset: Number.NaN } }],
  ] as const)(
    'recovers corrupt v%s Arrow route preferences before document creation',
    (schemaVersion, route) => {
      const fallback = defaultDrawingToolPreferences().defaults.arrow
      const parsed = parseDrawingToolPreferences({
        schemaVersion,
        defaults: { arrow: { ...fallback, ...route } },
        recentColors: [],
      })

      expect(parsed.defaults.arrow).toEqual(fallback)
      const recovered = documentWithRecoveredArrow(parsed)
      expect(() => serializeEditorDocument(recovered)).not.toThrow()
      expect(
        parseEditorDocument(serializeEditorDocument(recovered)),
      ).toMatchObject({ kind: 'editable' })
    },
  )

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
    expect(preferences.schemaVersion).toBe(2)
  })
})
