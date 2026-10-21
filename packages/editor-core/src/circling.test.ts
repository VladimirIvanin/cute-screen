import { readFileSync } from 'node:fs'
import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from './drawing'
import {
  shapeGeometry,
  flattenShapePath,
} from './shapes'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from './document/codec'
import { documentFixture } from './document/scene/test-kit'
import type { ShapeLayer } from './document/types'
import type { ShapeKind } from './shapes'
import type { ShapePathCommand } from './shape-path-types'
import { nextCirclingSequence } from './circling-presets'
import { createDocumentRenderScene } from './document/scene'
import { hitTestDocument } from './hit-test'
import {
  applyLayerStyle,
  extractLayerStyle,
} from './styles'
import {
  applyEditorCommand,
  revertEditorCommand,
} from './commands/operations'

const reference = JSON.parse(readFileSync(new URL('../../../tests/fixtures/circling-v2.json', import.meta.url), 'utf8')) as {
  width: number
  height: number
  candidates: { shape: ShapeKind; seed: number; path: ShapePathCommand[] }[]
}

function create(
  shape: ShapeKind,
  sketchSequence: number,
): ShapeLayer {
  return createDrawingLayer({
    id: `019c1f62-058e-7000-8000-${String(sketchSequence).padStart(12, '0')}`, tool: 'shape', sketchSequence,
    start: { x: 10, y: 10 }, end: { x: 250, y: 130 },
    defaults: { ...DEFAULT_DRAWING_DEFAULTS, shape: { ...DEFAULT_DRAWING_DEFAULTS.shape, shape } },
  }) as ShapeLayer
}

describe('owner-selected circling seeds', () => {
  it.each([
    ['circling', [1021, 241, 16411, 97531]],
    ['rectangularCircling', [683, 337, 127]],
  ] as const)('cycles the selected %s variants in the chosen order', (shape, seeds) => {
    for (let index = 0; index < 7; index++) {
      const layer = create(shape, index)
      expect(layer.payload).toMatchObject({
        sketchSeed: seeds[index % seeds.length], sketchVersion: 2, sketchSequence: index, fill: { kind: 'none' },
      })
    }
  })

  it('reproduces the six exact prototype candidates', () => {
    for (const candidate of reference.candidates) {
      const geometry = shapeGeometry(candidate.shape, reference.width, reference.height, {
        sketchSeed: candidate.seed, sketchVersion: 2,
      })
      expect(geometry.open).toBe(true)
      expect(geometry.outline.length).toBe(candidate.path.length)
      geometry.outline.forEach((command, index) => {
        expect(command[0]).toBe(candidate.path[index]![0])
        command.slice(1).forEach((value, coordinate) => {
          expect(value).toBeCloseTo(candidate.path[index]![coordinate + 1] as number, 10)
        })
      })
    }
  })

  it('persists v2 metadata and rejects inconsistent seed/sequence or unsupported versions', () => {
    const layer = create('circling', 4)
    const saved = JSON.parse(serializeEditorDocument({ ...documentFixture, layers: [layer] }))
    const reopened = parseEditorDocument(saved)
    expect(reopened.kind).toBe('editable')
    if (reopened.kind !== 'editable') throw new Error('Expected editable document')
    expect(reopened.document.layers[0]!.payload).toEqual(layer.payload)
    for (const patch of [{ sketchSequence: -1 }, { sketchSequence: 1.5 }, { sketchSeed: 683 },
      { sketchSequence: Number.MAX_SAFE_INTEGER }, { sketchVersion: 3 }]) {
      const invalid = structuredClone(saved)
      Object.assign(invalid.layers[0].payload, patch)
      expect(() => parseEditorDocument(invalid)).toThrow()
    }
  })

  it('keeps all six contours open, finite and bounded at tiny, square, wide and tall sizes', () => {
    const candidates = [...reference.candidates, { shape: 'circling' as const, seed: 97531 }]
    const dimensions = [[1, 1], [240, 120], [120, 120], [900, 90], [90, 900]] as const
    for (const candidate of candidates) for (const [width, height] of dimensions) {
      const geometry = shapeGeometry(candidate.shape, width, height, { sketchSeed: candidate.seed, sketchVersion: 2 })
      expect(geometry.outline.some((command) => command[0] === 'Z')).toBe(false)
      for (const point of flattenShapePath(geometry.outline).flat()) {
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
        expect(point.x).toBeGreaterThanOrEqual(-1e-9)
        expect(point.y).toBeGreaterThanOrEqual(-1e-9)
        expect(point.x).toBeLessThanOrEqual(width + 1e-9)
        expect(point.y).toBeLessThanOrEqual(height + 1e-9)
      }
    }
  })

  it('adds the reference oval with a long top overlap and a complete loop', () => {
    const contour = flattenShapePath(shapeGeometry('circling', 300, 150, { sketchSeed: 97531 }).outline)[0]!
    const first = contour[0]!, last = contour.at(-1)!
    expect(first.y).toBeLessThan(30)
    expect(last.y).toBeLessThan(30)
    expect(first.x - last.x).toBeGreaterThan(70)
    expect(last.y - first.y).toBeGreaterThan(8)
    const turn = contour.slice(1).reduce((sum, point, index) => {
      const previous = contour[index]!
      const delta = Math.atan2(point.y - 75, point.x - 150) - Math.atan2(previous.y - 75, previous.x - 150)
      return sum + Math.atan2(Math.sin(delta), Math.cos(delta))
    }, 0)
    expect(Math.abs(turn)).toBeGreaterThan(Math.PI * 2)
  })

  it('derives independent cursors from committed layers across duplicate, reorder, undo and reopen', () => {
    const oval = create('circling', 2), rectangle = create('rectangularCircling', 1)
    const duplicate = { ...oval, id: '019c1f62-058e-7000-8000-000000000099' }
    const before = { ...documentFixture, layers: [oval, rectangle] }
    expect(nextCirclingSequence([], 'circling')).toBe(0)
    expect(nextCirclingSequence(before.layers, 'rectangle')).toBeUndefined()
    const command = { type: 'duplicateLayer' as const, sourceId: oval.id, layer: duplicate }
    const after = applyEditorCommand(before, command)
    const restored = revertEditorCommand(after, command)
    for (const layers of [before.layers, after.layers, [...after.layers].reverse(), restored.layers]) {
      expect(nextCirclingSequence(layers, 'circling')).toBe(3)
      expect(nextCirclingSequence(layers, 'rectangularCircling')).toBe(2)
    }
    const parsed = parseEditorDocument(JSON.parse(serializeEditorDocument(after)))
    if (parsed.kind !== 'editable') throw new Error('Expected editable document')
    expect(nextCirclingSequence(parsed.document.layers, 'circling')).toBe(3)
    expect(createDocumentRenderScene(parsed.document)).toEqual(createDocumentRenderScene(after))
  })

  it('preserves instance metadata during style changes and shares the visible path with hit testing', () => {
    for (const [kind, count] of [['circling', 4], ['rectangularCircling', 3]] as const) for (let index = 0; index < count; index++) {
      const layer = create(kind, index)
      const styled = applyLayerStyle(layer, extractLayerStyle(create(kind, index + 1)))
      expect(styled.payload).toMatchObject({
        sketchSeed: layer.payload.sketchSeed, sketchVersion: 2, sketchSequence: index,
      })
      expect(extractLayerStyle(layer)).not.toHaveProperty('sketchSequence')
      const document = { ...documentFixture, layers: [layer] }
      expect(hitTestDocument(document, { x: 130, y: 70 })).toBeUndefined()
      const node = createDocumentRenderScene(document).nodes[0]!
      if (node.kind !== 'vector') throw new Error('Expected vector')
      const contour = flattenShapePath(node.outline)[0]!
      expect(hitTestDocument(document, contour[Math.floor(contour.length / 2)]!)).toBeDefined()
    }
  })
})
