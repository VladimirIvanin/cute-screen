import { describe, expect, it } from 'vitest'

import { CommandManager } from './commands'
import type { RulerLayer } from './document/types'
import { transformPoint, transformToMatrix } from './geometry'
import { DocumentSpatialIndex, hitTestDocument } from './hit-test'
import {
  CANVAS,
  IDS,
  baseDocument,
  precisionLayers,
  withLayers,
} from './precision-tools.test-kit'
import {
  createRulerLayer,
  rebaseRulerLayer,
  rulerVisualBoundsAreConservative,
  rulerVisualGeometry,
} from './tools/precision/ruler'

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
