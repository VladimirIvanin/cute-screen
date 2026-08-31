import { describe, expect, it } from 'vitest'

import { serializeEditorDocument } from './document/codec'
import { createDocumentRenderScene } from './document/scene'
import { hitTestDocument } from './hit-test'
import {
  CANVAS,
  IDS,
  precisionLayers,
  withLayers,
} from './precision-tools.test-kit'
import { createLoupeLayer } from './tools/precision/loupe'
import {
  createRulerLayer,
  measureRuler,
  snapRulerEndpoint,
} from './tools/precision/ruler'
import { createSpotlightLayer } from './tools/precision/spotlight'

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
