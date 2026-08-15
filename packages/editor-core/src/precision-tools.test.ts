import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  CENSOR_MODES,
  CommandManager,
  DocumentSpatialIndex,
  LOUPE_SHAPES,
  RULER_UNITS,
  SPOTLIGHT_SHAPES,
  createCensorLayer,
  createDocumentRenderScene,
  createEditorDocumentFromImage,
  createLoupeLayer,
  createRulerLayer,
  createSpotlightLayer,
  hitTestDocument,
  measureRuler,
  parseEditorDocument,
  rebaseRulerLayer,
  rulerVisualBoundsAreConservative,
  rulerVisualGeometry,
  serializeEditorDocument,
  snapRulerEndpoint,
  transformToMatrix,
  transformPoint,
  type CensorLayer,
  type CensorLayerPayload,
  type EditorDocument,
  type LoupeLayerPayload,
  type RulerLayer,
  type RulerLayerPayload,
  type SpotlightLayerPayload,
} from './index'

const IDS = {
  document: '019c1f62-058e-7000-8000-000000000000',
  base: '019c1f62-058e-7000-8000-000000000001',
  censor: '019c1f62-058e-7000-8000-000000000002',
  spotlight: '019c1f62-058e-7000-8000-000000000003',
  ruler: '019c1f62-058e-7000-8000-000000000004',
  loupe: '019c1f62-058e-7000-8000-000000000005',
} as const

const source = {
  blobHash: 'a'.repeat(64),
  format: 'png' as const,
  mimeType: 'image/png',
  width: 800,
  height: 600,
  orientationApplied: true as const,
  provenance: 'capture' as const,
  color: { colorSpace: 'srgb' as const, hasIccProfile: false },
}
const CANVAS = { width: source.width, height: source.height } as const

function baseDocument(): EditorDocument {
  return createEditorDocumentFromImage({
    id: IDS.document,
    baseLayerId: IDS.base,
    source,
    timestamp: '2026-08-15T00:00:00.000Z',
  })
}

function withLayers(layers: EditorDocument['layers']): EditorDocument {
  return { ...baseDocument(), layers }
}

function precisionLayers() {
  const censor = createCensorLayer({
    id: IDS.censor,
    region: {
      kind: 'freeform',
      points: [
        { x: 20, y: 30 },
        { x: 100, y: 30 },
        { x: 60, y: 90 },
      ],
    },
    effect: { mode: 'pixelate', blockSize: 12 },
  })
  const spotlight = createSpotlightLayer({
    id: IDS.spotlight,
    bounds: { x: 140, y: 40, width: 120, height: 80 },
    shape: 'ellipse',
    dimColor: { red: 0.05, green: 0.08, blue: 0.12, alpha: 1 },
    dimOpacity: 0.7,
    feather: 'soft',
  })
  const ruler = createRulerLayer({
    id: IDS.ruler,
    canvas: CANVAS,
    start: { x: 300, y: 100 },
    end: { x: 420, y: 190 },
    unit: 'percent',
    snapAngleIncrementDegrees: 15,
  })
  const loupe = createLoupeLayer({
    id: IDS.loupe,
    canvas: CANVAS,
    sourceRegion: { x: 80, y: 100, width: 60, height: 60 },
    destination: { x: 500, y: 260 },
    zoom: 3,
    size: 180,
    shape: 'circle',
    borderColor: { red: 1, green: 0.8, blue: 0.2, alpha: 1 },
    borderWidth: 4,
    shadow: {
      color: { red: 0, green: 0, blue: 0, alpha: 0.4 },
      offsetX: 0,
      offsetY: 8,
      blur: 16,
    },
  })
  return { censor, spotlight, ruler, loupe }
}

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

describe('M08 geometry, hit testing and renderer-neutral scene', () => {
  it('normalizes freeform censor bounds and hits the polygon rather than its box', () => {
    const { censor } = precisionLayers()
    expect(censor.transform).toMatchObject({ translateX: 20, translateY: 30 })
    expect(censor.localBounds).toEqual({ x: 0, y: 0, width: 80, height: 60 })
    expect(censor.payload.region).toEqual({
      kind: 'freeform',
      points: [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 40, y: 60 },
      ],
    })
    const document = withLayers([censor])
    expect(hitTestDocument(document, { x: 60, y: 50 })?.part).toBe('fill')
    expect(hitTestDocument(document, { x: 22, y: 86 })).toBeUndefined()

    const scene = createDocumentRenderScene(document)
    expect(scene.nodes).toEqual([
      expect.objectContaining({
        kind: 'censor',
        sampleSource: 'compositeBelow',
        region: {
          kind: 'freeform',
          points: [
            { x: 20, y: 30 },
            { x: 100, y: 30 },
            { x: 60, y: 90 },
          ],
        },
        effect: { mode: 'pixelate', blockSize: 12 },
      }),
    ])
  })

  it('uses exact spotlight and loupe shape geometry for hit testing and scene data', () => {
    const { spotlight, loupe } = precisionLayers()
    const document = withLayers([spotlight, loupe])
    expect(hitTestDocument(document, { x: 500, y: 260 })).toBeUndefined()
    expect(hitTestDocument(document, { x: 590, y: 350 })?.nodeId).toBe(
      IDS.loupe,
    )
    expect(hitTestDocument(document, { x: 501, y: 261 })).toBeUndefined()
    expect(hitTestDocument(document, { x: 200, y: 80 })?.nodeId).toBe(
      IDS.spotlight,
    )
    expect(hitTestDocument(document, { x: 142, y: 42 })).toBeUndefined()

    expect(createDocumentRenderScene(document).nodes).toEqual([
      expect.objectContaining({
        kind: 'spotlight',
        aperture: {
          shape: 'ellipse',
          x: 140,
          y: 40,
          width: 120,
          height: 80,
        },
        dimOpacity: 0.7,
        feather: 'soft',
      }),
      expect.objectContaining({
        kind: 'loupe',
        sampleSource: 'compositeBelow',
        sourceRegion: { x: 80, y: 100, width: 60, height: 60 },
        lens: { shape: 'circle', x: 500, y: 260, size: 180 },
        zoom: 3,
      }),
    ])
  })

  it.each([
    ['rectangle', { x: 142, y: 42 }, true],
    ['ellipse', { x: 142, y: 42 }, false],
    ['diamond', { x: 142, y: 42 }, false],
    ['diamond', { x: 200, y: 80 }, true],
  ] as const)('hit-tests a %s spotlight aperture', (shape, point, expected) => {
    const layer = createSpotlightLayer({
      id: IDS.spotlight,
      bounds: { x: 140, y: 40, width: 120, height: 80 },
      shape,
    })
    expect(hitTestDocument(withLayers([layer]), point) !== undefined).toBe(
      expected,
    )
  })

  it('hit-tests a rectangular loupe by its destination lens', () => {
    const layer = createLoupeLayer({
      id: IDS.loupe,
      canvas: CANVAS,
      sourceRegion: { x: 10, y: 10, width: 40, height: 40 },
      destination: { x: 200, y: 220 },
      zoom: 2,
      size: 80,
      shape: 'rectangle',
    })
    expect(
      hitTestDocument(withLayers([layer]), { x: 201, y: 221 })?.nodeId,
    ).toBe(IDS.loupe)
  })

  it('measures pixels/percent against the canvas diagonal and snaps deterministically', () => {
    const pixelRuler = createRulerLayer({
      id: IDS.ruler,
      canvas: CANVAS,
      start: { x: 0, y: 0 },
      end: { x: 300, y: 400 },
      unit: 'pixels',
    })
    expect(measureRuler(pixelRuler, { width: 300, height: 400 })).toEqual({
      length: 500,
      angleDegrees: expect.closeTo(53.13010235415598, 10),
      percent: 100,
      percentBasis: 'canvasDiagonal',
      label: '500 px',
    })
    expect(
      measureRuler(
        { ...pixelRuler, payload: { ...pixelRuler.payload, unit: 'percent' } },
        { width: 300, height: 400 },
      ).label,
    ).toBe('100%')

    const fractionalPixelRuler = createRulerLayer({
      id: IDS.ruler,
      canvas: CANVAS,
      start: { x: 0, y: 0 },
      end: { x: 4, y: 3.2 },
      unit: 'pixels',
    })
    expect(
      measureRuler(fractionalPixelRuler, { width: 300, height: 400 }).label,
    ).toBe('5 px')

    const candidate = {
      x: Math.cos((7 * Math.PI) / 180) * 100,
      y: Math.sin((7 * Math.PI) / 180) * 100,
    }
    const snapped = snapRulerEndpoint({ x: 0, y: 0 }, candidate, 10)
    expect(snapped.snapped).toBe(true)
    expect(snapped.angleDegrees).toBe(10)
    expect(Math.hypot(snapped.end.x, snapped.end.y)).toBeCloseTo(100, 10)
    expect(snapped.guide).toEqual({
      kind: 'angle',
      start: { x: 0, y: 0 },
      end: snapped.end,
      angleDegrees: 10,
    })

    const document = withLayers([pixelRuler])
    expect(serializeEditorDocument(document)).not.toMatch(/guide/iu)
    expect(hitTestDocument(document, { x: 150, y: 200 })?.part).toBe('stroke')
    expect(hitTestDocument(document, { x: 150, y: 220 })).toBeUndefined()
    expect(createDocumentRenderScene(document).nodes[0]).toMatchObject({
      kind: 'ruler',
      x1: 0,
      y1: 0,
      x2: 300,
      y2: 400,
      length: 500,
      label: '500 px',
      color: {
        red: 227 / 255,
        green: 72 / 255,
        blue: 143 / 255,
        alpha: 1,
      },
      thickness: 2,
      fontSize: 14,
    })
  })
})

describe('M08 command and lifecycle boundary', () => {
  it('creates each layer through one addLayer command and supports update/undo/redo', () => {
    const { censor, spotlight, ruler, loupe } = precisionLayers()
    const manager = new CommandManager(baseDocument())
    for (const layer of [censor, spotlight, ruler, loupe]) {
      manager.execute({ type: 'addLayer', layer })
    }
    expect(manager.snapshot.document.layers.slice(1)).toEqual([
      censor,
      spotlight,
      ruler,
      loupe,
    ])
    expect(JSON.stringify(manager.snapshot.document)).not.toMatch(
      /selection|selected/iu,
    )

    const updated = {
      ...censor,
      payload: {
        ...censor.payload,
        effect: {
          mode: 'solid' as const,
          color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 },
        },
      },
    }
    manager.execute({ type: 'updateLayer', before: censor, after: updated })
    expect(manager.snapshot.document.layers[1]).toEqual(updated)
    expect(manager.undo().document.layers[1]).toEqual(censor)
    expect(manager.undo().document.layers).toHaveLength(4)
    expect(manager.redo().document.layers).toHaveLength(5)
    expect(manager.redo().document.layers[1]).toEqual(updated)

    const styledRuler = rebaseRulerLayer(
      ruler,
      {
        ...ruler.payload,
        color: { red: 0.1, green: 0.8, blue: 0.4, alpha: 1 },
        thickness: 6,
        fontSize: 24,
      },
      baseDocument().canvas,
    ) satisfies RulerLayer
    manager.execute({
      type: 'updateLayer',
      before: ruler,
      after: styledRuler,
    })
    expect(manager.snapshot.document.layers[3]).toEqual(styledRuler)
    expect(manager.undo().document.layers[3]).toEqual(ruler)
    expect(manager.redo().document.layers[3]).toEqual(styledRuler)
  })

  it('rebases short-ruler visual bounds after style growth without moving world endpoints', () => {
    const ruler = createRulerLayer({
      id: IDS.ruler,
      canvas: CANVAS,
      start: { x: 100, y: 100 },
      end: { x: 108, y: 100 },
      unit: 'pixels',
    })
    const beforeWorld = [
      {
        x: ruler.transform.translateX + ruler.payload.start.x,
        y: ruler.transform.translateY + ruler.payload.start.y,
      },
      {
        x: ruler.transform.translateX + ruler.payload.end.x,
        y: ruler.transform.translateY + ruler.payload.end.y,
      },
    ]
    expect(ruler.localBounds.width).toBeGreaterThan(60)
    expect(
      hitTestDocument(withLayers([ruler]), { x: 104, y: 106 }),
    ).toMatchObject({ nodeId: IDS.ruler })

    const styled = rebaseRulerLayer(
      ruler,
      { ...ruler.payload, thickness: 12, fontSize: 48 },
      baseDocument().canvas,
    )
    const afterWorld = [
      {
        x: styled.transform.translateX + styled.payload.start.x,
        y: styled.transform.translateY + styled.payload.start.y,
      },
      {
        x: styled.transform.translateX + styled.payload.end.x,
        y: styled.transform.translateY + styled.payload.end.y,
      },
    ]
    expect(afterWorld).toEqual(beforeWorld)
    expect(styled.localBounds.width).toBeGreaterThan(ruler.localBounds.width)
    expect(styled.localBounds.height).toBeGreaterThan(ruler.localBounds.height)
    expect(
      hitTestDocument(withLayers([styled]), { x: 104, y: 120 }),
    ).toMatchObject({ nodeId: IDS.ruler, part: 'fill' })

    const manager = new CommandManager(withLayers([ruler]))
    manager.execute({ type: 'updateLayer', before: ruler, after: styled })
    expect(manager.snapshot.document.layers[0]).toEqual(styled)
    expect(manager.undo().document.layers[0]).toEqual(ruler)
    expect(manager.redo().document.layers[0]).toEqual(styled)
  })

  it.each([
    ['strong scale-down', 0, 0.05, 0.12],
    ['non-uniform rotation', 37, 0.08, 0.35],
    ['rotated horizontal reflection', 127, -0.07, 0.28],
    ['rotated vertical reflection', -73, 0.09, -0.22],
  ] as const)(
    'canonicalizes %s bounds for selection, badge hit and spatial broad phase without moving transformed endpoints',
    (_name, rotation, scaleX, scaleY) => {
      const ruler = createRulerLayer({
        id: IDS.ruler,
        canvas: CANVAS,
        start: { x: 180, y: 220 },
        end: { x: 300, y: 260 },
      })
      const transformed = {
        ...ruler,
        transform: {
          ...ruler.transform,
          translateX: ruler.transform.translateX + 120,
          translateY: ruler.transform.translateY - 40,
          rotation,
          scaleX,
          scaleY,
        },
      } satisfies RulerLayer
      const expectedWorldEndpoints = [
        transformPoint(
          transformToMatrix(transformed.transform),
          transformed.payload.start,
        ),
        transformPoint(
          transformToMatrix(transformed.transform),
          transformed.payload.end,
        ),
      ] as const
      expect(rulerVisualBoundsAreConservative(transformed, CANVAS)).toBe(false)

      const canonical = rebaseRulerLayer(
        transformed,
        transformed.payload,
        CANVAS,
      )
      const actualWorldEndpoints = [
        transformPoint(
          transformToMatrix(canonical.transform),
          canonical.payload.start,
        ),
        transformPoint(
          transformToMatrix(canonical.transform),
          canonical.payload.end,
        ),
      ] as const
      for (const index of [0, 1] as const) {
        expect(actualWorldEndpoints[index].x).toBeCloseTo(
          expectedWorldEndpoints[index].x,
          10,
        )
        expect(actualWorldEndpoints[index].y).toBeCloseTo(
          expectedWorldEndpoints[index].y,
          10,
        )
      }
      expect(canonical.transform).toMatchObject({ rotation, scaleX, scaleY })
      expect(rulerVisualBoundsAreConservative(canonical, CANVAS)).toBe(true)

      const visual = rulerVisualGeometry(canonical, canonical.payload, CANVAS)
      for (const point of visual.badgePolygon) {
        expect(point.x).toBeGreaterThanOrEqual(canonical.localBounds.x - 1e-9)
        expect(point.x).toBeLessThanOrEqual(
          canonical.localBounds.x + canonical.localBounds.width + 1e-9,
        )
        expect(point.y).toBeGreaterThanOrEqual(canonical.localBounds.y - 1e-9)
        expect(point.y).toBeLessThanOrEqual(
          canonical.localBounds.y + canonical.localBounds.height + 1e-9,
        )
      }

      const [start, end] = actualWorldEndpoints
      const length = Math.hypot(end.x - start.x, end.y - start.y)
      const badgePoint = {
        x: (start.x + end.x) / 2 - ((end.y - start.y) / length) * 8,
        y: (start.y + end.y) / 2 + ((end.x - start.x) / length) * 8,
      }
      const document = withLayers([canonical])
      expect(hitTestDocument(document, badgePoint)).toMatchObject({
        nodeId: IDS.ruler,
        part: 'fill',
      })
      expect(new DocumentSpatialIndex(document).hitAll(badgePoint)).toEqual([
        expect.objectContaining({ nodeId: IDS.ruler, part: 'fill' }),
      ])
    },
  )
})
