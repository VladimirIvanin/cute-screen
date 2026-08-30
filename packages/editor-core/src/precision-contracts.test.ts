import { describe, expect, expectTypeOf, it } from 'vitest'

import { parseEditorDocument, serializeEditorDocument } from './document/codec'
import {
  CENSOR_MODES,
  LOUPE_SHAPES,
  RULER_UNITS,
  SPOTLIGHT_SHAPES,
  type CensorLayer,
  type CensorLayerPayload,
  type LoupeLayerPayload,
  type RulerLayerPayload,
  type SpotlightLayerPayload,
} from './document/types'
import {
  CANVAS,
  IDS,
  baseDocument,
  precisionLayers,
  withLayers,
} from './precision-tools.test-kit'
import { createCensorLayer } from './tools/precision/censor'
import { createLoupeLayer } from './tools/precision/loupe'
import { createRulerLayer } from './tools/precision/ruler'
import { createSpotlightLayer } from './tools/precision/spotlight'

describe('M08 precision-tool document contracts', () => {
  it('replaces JsonObject placeholders with explicit immutable payload types', () => {
    expect(CENSOR_MODES).toEqual(['pixelate', 'blur', 'solid'])
    expect(SPOTLIGHT_SHAPES).toEqual(['rectangle', 'ellipse', 'diamond'])
    expect(RULER_UNITS).toEqual(['pixels', 'percent'])
    expect(LOUPE_SHAPES).toEqual(['circle', 'rectangle'])
    expectTypeOf<CensorLayer['payload']>().toEqualTypeOf<CensorLayerPayload>()
    expectTypeOf<keyof CensorLayerPayload>().toEqualTypeOf<
      'region' | 'effect' | 'sampleSource'
    >()
    expectTypeOf<keyof SpotlightLayerPayload>().toEqualTypeOf<
      'shape' | 'dimColor' | 'dimOpacity' | 'feather'
    >()
    expectTypeOf<keyof RulerLayerPayload>().toEqualTypeOf<
      | 'start'
      | 'end'
      | 'unit'
      | 'percentBasis'
      | 'snapAngleIncrementDegrees'
      | 'color'
      | 'thickness'
      | 'fontSize'
    >()
    expectTypeOf<keyof LoupeLayerPayload>().toEqualTypeOf<
      'sourceRegion' | 'lens' | 'zoom' | 'border' | 'shadow' | 'sampleSource'
    >()
  })

  it('provides deterministic factory defaults without UI selection state', () => {
    const censor = createCensorLayer({
      id: IDS.censor,
      region: {
        kind: 'rectangle',
        bounds: { x: 10, y: 20, width: 80, height: 50 },
      },
    })
    const spotlight = createSpotlightLayer({
      id: IDS.spotlight,
      bounds: { x: 30, y: 40, width: 100, height: 70 },
    })
    const ruler = createRulerLayer({
      id: IDS.ruler,
      canvas: CANVAS,
      start: { x: 10, y: 10 },
      end: { x: 50, y: 30 },
    })
    const loupe = createLoupeLayer({
      id: IDS.loupe,
      canvas: CANVAS,
      sourceRegion: { x: 0, y: 0, width: 40, height: 40 },
      destination: { x: 200, y: 220 },
    })

    expect(censor.payload).toEqual({
      region: { kind: 'rectangle' },
      effect: { mode: 'pixelate', blockSize: 12 },
      sampleSource: 'compositeBelow',
    })
    expect(spotlight.payload).toEqual({
      shape: 'rectangle',
      dimColor: { red: 0, green: 0, blue: 0, alpha: 1 },
      dimOpacity: 0.65,
      feather: null,
    })
    expect(ruler.payload).toMatchObject({
      unit: 'pixels',
      percentBasis: 'canvasDiagonal',
      snapAngleIncrementDegrees: 15,
      color: {
        red: 227 / 255,
        green: 72 / 255,
        blue: 143 / 255,
        alpha: 1,
      },
      thickness: 2,
      fontSize: 14,
    })
    expect(loupe.payload).toMatchObject({
      lens: { shape: 'circle', size: 80 },
      zoom: 2,
      border: { color: { red: 1, green: 1, blue: 1, alpha: 1 }, width: 3 },
      sampleSource: 'compositeBelow',
    })
    for (const layer of [censor, spotlight, ruler, loupe]) {
      expect(Object.isFrozen(layer)).toBe(true)
      expect(Object.isFrozen(layer.payload)).toBe(true)
      expect(JSON.stringify(layer)).not.toMatch(/selection|selected/iu)
    }
  })

  it('strictly round-trips all precision layers through the production v7 codec', () => {
    const { censor, spotlight, ruler, loupe } = precisionLayers()
    const parsed = parseEditorDocument(
      serializeEditorDocument(
        withLayers([
          baseDocument().layers[0]!,
          censor,
          spotlight,
          ruler,
          loupe,
        ]),
      ),
    )

    expect(parsed).toMatchObject({ kind: 'editable' })
    if (parsed.kind !== 'editable') throw new Error('expected editable v7')
    expect(parsed.document.layers.slice(1)).toEqual([
      censor,
      spotlight,
      ruler,
      loupe,
    ])
    expect(serializeEditorDocument(parsed.document)).not.toMatch(
      /ocr|automatic|detect|eraser|guide/iu,
    )
  })

  it('requires persisted ruler colour, thickness and font size in strict v7', () => {
    const { ruler } = precisionLayers()
    const document = structuredClone(
      withLayers([baseDocument().layers[0]!, ruler]),
    )
    for (const field of ['color', 'thickness', 'fontSize'] as const) {
      const candidate = structuredClone(document)
      Reflect.deleteProperty(candidate.layers[1]!.payload, field)
      expect(() => parseEditorDocument(candidate)).toThrow(
        new RegExp(field, 'iu'),
      )
    }
  })

  it('rejects a strict-v7 ruler whose bounds contain its endpoints but not its derived badge and ticks', () => {
    const { ruler } = precisionLayers()
    const candidate = structuredClone(
      withLayers([baseDocument().layers[0]!, ruler]),
    )
    const persisted = candidate.layers[1]!
    if (persisted.kind !== 'ruler') throw new Error('expected ruler fixture')
    const minimumX = Math.min(
      persisted.payload.start.x,
      persisted.payload.end.x,
    )
    const maximumX = Math.max(
      persisted.payload.start.x,
      persisted.payload.end.x,
    )
    const minimumY = Math.min(
      persisted.payload.start.y,
      persisted.payload.end.y,
    )
    const maximumY = Math.max(
      persisted.payload.start.y,
      persisted.payload.end.y,
    )
    Reflect.set(persisted, 'localBounds', {
      x: minimumX - 0.5,
      y: minimumY - 0.5,
      width: Math.max(1, maximumX - minimumX + 1),
      height: Math.max(1, maximumY - minimumY + 1),
    })

    expect(() => parseEditorDocument(candidate)).toThrow(/conservative/u)
    expect(persisted.payload).toMatchObject({
      color: ruler.payload.color,
      thickness: ruler.payload.thickness,
      fontSize: ruler.payload.fontSize,
    })
  })

  it.each([
    { mode: 'pixelate' as const, blockSize: 8 },
    { mode: 'blur' as const, strength: 24 },
    {
      mode: 'solid' as const,
      color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 },
    },
  ])('round-trips only the mode-specific censor fields for $mode', (effect) => {
    const layer = createCensorLayer({
      id: IDS.censor,
      region: {
        kind: 'rectangle',
        bounds: { x: 20, y: 30, width: 80, height: 60 },
      },
      effect,
    })
    const parsed = parseEditorDocument(
      withLayers([baseDocument().layers[0]!, layer]),
    )
    expect(parsed).toMatchObject({ kind: 'editable' })
    if (parsed.kind !== 'editable') throw new Error('expected editable v7')
    const reopened = parsed.document.layers[1]
    expect(reopened?.kind).toBe('censor')
    if (reopened?.kind !== 'censor') throw new Error('expected censor')
    expect(reopened.payload.effect).toEqual(effect)
    expect(Object.keys(reopened.payload.effect).sort()).toEqual(
      Object.keys(effect).sort(),
    )
  })

  it.each([
    ['unknown censor field', IDS.censor, 'ocr', true],
    ['removed censor mode', IDS.censor, 'effect', { mode: 'redact' }],
    ['automatic censor data', IDS.censor, 'automaticDetection', {}],
    ['unknown spotlight shape', IDS.spotlight, 'shape', 'circle'],
    ['serialized ruler guide', IDS.ruler, 'guide', { x: 10 }],
    ['unknown loupe recursion flag', IDS.loupe, 'recursive', true],
  ])('rejects %s', (_name, id, field, value) => {
    const layers = precisionLayers()
    const layer = Object.values(layers).find((candidate) => candidate.id === id)
    if (!layer) throw new Error('fixture layer was not found')
    const candidate = structuredClone(
      withLayers([baseDocument().layers[0]!, layer]),
    )
    Reflect.set(candidate.layers[1]!.payload, field, value)
    expect(() => parseEditorDocument(candidate)).toThrow(
      /invalid|removed|unexpected|unsupported/u,
    )
  })

  it('rejects transient selection and unknown transform/bounds fields', () => {
    const { spotlight } = precisionLayers()
    for (const [target, key] of [
      [spotlight, 'selection'],
      [spotlight.transform, 'skewX'],
      [spotlight.localBounds, 'radius'],
    ] as const) {
      const candidate = structuredClone(
        withLayers([baseDocument().layers[0]!, spotlight]),
      )
      const layer = candidate.layers[1]!
      const mutationTarget =
        target === spotlight
          ? layer
          : target === spotlight.transform
            ? layer.transform
            : layer.localBounds
      Reflect.set(mutationTarget, key, 1)
      expect(() => parseEditorDocument(candidate)).toThrow(
        /unexpected|removed/u,
      )
    }
  })

  it('rejects malformed, non-finite and out-of-bounds payload geometry/settings', () => {
    const { censor, spotlight, ruler, loupe } = precisionLayers()
    const invalid = [
      {
        ...censor,
        payload: {
          ...censor.payload,
          effect: { mode: 'pixelate', blockSize: 0 },
        },
      },
      {
        ...censor,
        payload: {
          ...censor.payload,
          region: {
            kind: 'freeform',
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
              { x: 2, y: 2 },
            ],
          },
        },
      },
      { ...spotlight, payload: { ...spotlight.payload, dimOpacity: 1.01 } },
      { ...ruler, payload: { ...ruler.payload, end: ruler.payload.start } },
      {
        ...ruler,
        payload: { ...ruler.payload, snapAngleIncrementDegrees: Number.NaN },
      },
      { ...ruler, payload: { ...ruler.payload, thickness: 0 } },
      { ...ruler, payload: { ...ruler.payload, thickness: 2.5 } },
      { ...ruler, payload: { ...ruler.payload, thickness: 13 } },
      { ...ruler, payload: { ...ruler.payload, fontSize: 9 } },
      { ...ruler, payload: { ...ruler.payload, fontSize: 14.5 } },
      { ...ruler, payload: { ...ruler.payload, fontSize: 49 } },
      {
        ...ruler,
        payload: {
          ...ruler.payload,
          color: { ...ruler.payload.color, red: 1.01 },
        },
      },
      { ...loupe, payload: { ...loupe.payload, zoom: 17 } },
      {
        ...loupe,
        payload: {
          ...loupe.payload,
          sourceRegion: { x: 800, y: 580, width: 60, height: 60 },
        },
      },
      {
        ...loupe,
        payload: {
          ...loupe.payload,
          border: { ...loupe.payload.border, width: 65 },
        },
      },
    ]

    for (const layer of invalid) {
      expect(() =>
        parseEditorDocument(
          withLayers([baseDocument().layers[0]!, layer as typeof censor]),
        ),
      ).toThrow()
    }
  })

  it('accepts a bounded partially out-of-canvas loupe source but rejects disjoint and abusive coordinates', () => {
    const partial = createLoupeLayer({
      id: IDS.loupe,
      canvas: CANVAS,
      sourceRegion: { x: -20, y: 560, width: 60, height: 60 },
      destination: { x: 500, y: 260 },
      zoom: 2,
      size: 120,
      shape: 'rectangle',
    })
    const valid = withLayers([baseDocument().layers[0]!, partial])
    const candidate = (
      sourceRegion: Readonly<{
        x: number
        y: number
        width: number
        height: number
      }>,
      canvas = valid.canvas,
    ) => ({
      ...valid,
      canvas,
      layers: [
        valid.layers[0]!,
        {
          ...partial,
          payload: { ...partial.payload, sourceRegion },
        },
      ],
    })

    expect(parseEditorDocument(valid)).toMatchObject({ kind: 'editable' })

    expect(() =>
      parseEditorDocument(candidate({ x: -61, y: 560, width: 60, height: 60 })),
    ).toThrow(/sourceRegion/u)
    expect(() =>
      parseEditorDocument(
        candidate(
          { x: 1_000_001, y: 20, width: 60, height: 60 },
          { ...valid.canvas, width: 2_000_000 },
        ),
      ),
    ).toThrow(/sourceRegion/u)

    for (const sourceRegion of [
      { x: Number.NaN, y: 20, width: 60, height: 60 },
      { x: -20, y: 20, width: 0, height: 60 },
      { x: -20, y: 20, width: 60, height: -1 },
    ]) {
      expect(() => parseEditorDocument(candidate(sourceRegion))).toThrow(
        /sourceRegion/u,
      )
    }
  })
})
