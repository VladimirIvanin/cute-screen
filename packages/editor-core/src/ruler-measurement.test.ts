import {
  describe,
  expect,
  it,
} from 'vitest'
import { CommandManager } from './commands'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from './document/codec'
import { createDocumentRenderScene } from './document/scene'
import {
  baseDocument,
  IDS,
} from './precision-tools.test-kit'
import {
  createRulerLayer,
  measureRuler,
  rulerVisualBoundsAreConservative,
} from './tools/precision/ruler'

const canvas = { width: 1200, height: 800 }
const crop = { x: 200, y: 150, width: 300, height: 400 }
const ruler = (percentBasis: 'canvasWidth' | 'canvasHeight' | 'canvasDiagonal') => createRulerLayer({
  id: IDS.ruler, canvas, start: { x: 250, y: 200 }, end: { x: 350, y: 200 }, unit: 'percent', percentBasis,
})

describe('ruler percent bases and visible measurement area', () => {
  it.each([
    ['canvasWidth', 100 / 1200 * 100, 100 / 300 * 100],
    ['canvasHeight', 100 / 800 * 100, 25],
    ['canvasDiagonal', 100 / Math.hypot(1200, 800) * 100, 20],
  ] as const)('measures %s consistently in the panel contract and cropped scene', (basis, full, cropped) => {
    const layer = ruler(basis)
    expect(layer.payload.percentBasis).toBe(basis)
    expect(measureRuler(layer, canvas).percent).toBeCloseTo(full)
    const scene = createDocumentRenderScene({ ...baseDocument(), canvas, crop, layers: [layer] })
    expect(scene.nodes[0]).toMatchObject({ kind: 'ruler', percentBasis: basis, percent: expect.closeTo(cropped) })
    expect(scene.nodes[0]).toHaveProperty('label', `${Number(cropped.toFixed(2))}%`)
  })

  it('measures the vector length rather than its projection, including values over 100%', () => {
    const layer = createRulerLayer({ id: IDS.ruler, canvas, start: { x: 0, y: 0 }, end: { x: 300, y: 400 }, unit: 'percent', percentBasis: 'canvasWidth' })
    expect(measureRuler(layer, crop)).toMatchObject({ length: 500, percent: expect.closeTo(500 / 300 * 100), label: '166.67%' })
    const rotated = { ...layer, transform: { ...layer.transform, rotation: 73, scaleX: -1 } }
    expect(measureRuler(rotated, crop).percent).toBeCloseTo(500 / 300 * 100)
  })

  it.each(['canvasWidth', 'canvasHeight', 'canvasDiagonal'] as const)('round-trips v7 %s and its cropped badge', (basis) => {
    const manager = new CommandManager({ ...baseDocument(), canvas, layers: [ruler(basis)] })
    manager.execute({ type: 'setCrop', before: null, after: crop })
    const parsed = parseEditorDocument(serializeEditorDocument(manager.snapshot.document))
    expect(parsed.kind).toBe('editable')
    if (parsed.kind !== 'editable') throw new Error('expected editable document')
    expect(parsed.document.layers[0]).toEqual(manager.snapshot.document.layers[0])
    expect(parsed.document.layers[0]).toMatchObject({ payload: { percentBasis: basis } })
  })

  it('updates locked and hidden badge bounds atomically with crop and restores them exactly', () => {
    const source = createRulerLayer({ id: IDS.ruler, canvas, start: { x: 330, y: 330 }, end: { x: 330, y: 430 }, unit: 'percent', percentBasis: 'canvasWidth', fontSize: 48 })
    const layer = { ...source, locked: true, visible: false }
    const manager = new CommandManager({ ...baseDocument(), canvas, layers: [layer] })
    const before = manager.snapshot.document
    const after = manager.execute({ type: 'setCrop', before: null, after: crop }).document
    expect(after.layers[0]).not.toEqual(before.layers[0])
    expect(rulerVisualBoundsAreConservative(after.layers[0] as typeof source, crop)).toBe(true)
    expect(manager.undo().document).toEqual(before)
    expect(manager.redo().document).toEqual(after)
  })

  it('opens an existing diagonal v7 ruler in a crop using the new visible-area calculation', () => {
    const legacy = { ...baseDocument(), canvas, crop, layers: [ruler('canvasDiagonal')] }
    const parsed = parseEditorDocument(legacy)
    expect(parsed.kind).toBe('editable')
    if (parsed.kind !== 'editable') throw new Error('expected editable document')
    expect(parsed.document.layers[0]).toMatchObject({ payload: { percentBasis: 'canvasDiagonal' } })
    expect(createDocumentRenderScene(parsed.document).nodes[0]).toHaveProperty('label', '20%')
  })
  it('refreshes old full-canvas badge bounds before creating history without moving its endpoints', () => {
    const legacyCrop = { x: 200, y: 150, width: 300, height: 200 }
    const layer = createRulerLayer({ id: IDS.ruler, canvas, start: { x: 330, y: 200 }, end: { x: 330, y: 300 },
      unit: 'percent', percentBasis: 'canvasDiagonal', fontSize: 48 })
    expect(rulerVisualBoundsAreConservative(layer, legacyCrop)).toBe(false)
    const parsed = parseEditorDocument({ ...baseDocument(), canvas, crop: legacyCrop, layers: [layer] })
    if (parsed.kind !== 'editable') throw new Error('expected editable document')
    const reopened = parsed.document.layers[0] as typeof layer
    expect(rulerVisualBoundsAreConservative(reopened, legacyCrop)).toBe(true)
    for (const key of ['start', 'end'] as const) {
      expect(reopened.transform.translateX + reopened.payload[key].x)
        .toBeCloseTo(layer.transform.translateX + layer.payload[key].x)
      expect(reopened.transform.translateY + reopened.payload[key].y)
        .toBeCloseTo(layer.transform.translateY + layer.payload[key].y)
    }
    expect(new CommandManager(parsed.document).snapshot.canUndo).toBe(false)
  })

  it('rejects unknown persisted measurement bases instead of guessing a denominator', () => {
    const layer = ruler('canvasDiagonal')
    const invalid = { ...layer, payload: { ...layer.payload, percentBasis: 'screenWidth' } }
    expect(() => parseEditorDocument({ ...baseDocument(), layers: [invalid] })).toThrow(/percentBasis/u)
  })

})
