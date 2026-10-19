import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  createPlacedEmoji,
  replaceEmoji,
  resizeEmoji,
  emojiResourceId,
} from './emoji'
import { createDocumentRenderScene } from './document/scene'
import {
  baseDocument,
  IDS,
} from './precision-tools.test-kit'
import { CommandManager } from './commands'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from './document/codec'
import { resizeLayerGeometry } from './layer-resize'
import {
  transformPoint,
  transformToMatrix,
} from './geometry'

describe('portable bundled emoji', () => {
  it('places a square inside a non-origin crop and reduces it on a tiny canvas', () => {
    const layer = createPlacedEmoji(IDS.censor, '1f44e', { x: 200, y: 100 }, 64, { x: 120, y: 80, width: 100, height: 60 })
    expect(layer.localBounds).toEqual({ x: 0, y: 0, width: 60, height: 60 })
    expect(layer.transform).toMatchObject({ translateX: 160, translateY: 80, scaleX: 1, scaleY: 1 })
  })
  it('projects an image resource and round-trips its versioned reference with history', () => {
    const layer = createPlacedEmoji(IDS.censor, '1f525', { x: 100, y: 100 }, 64, { x: 0, y: 0, width: 800, height: 600 })
    const history = new CommandManager(baseDocument())
    history.execute({ type: 'addLayer', layer })
    const snapshot = history.snapshot
    const parsed = parseEditorDocument(JSON.parse(serializeEditorDocument(snapshot.document)))
    expect(parsed.kind).toBe('editable')
    expect(createDocumentRenderScene(snapshot.document).nodes.at(-1)).toMatchObject({ kind: 'image', resourceId: emojiResourceId(layer.payload.asset), width: 64 })
    history.undo()
    expect(history.snapshot.document.layers).toHaveLength(1)
    history.redo()
    expect(history.snapshot.document.layers.at(-1)).toEqual(layer)
  })
  it('replaces only the glyph and resizes intrinsically around the center', () => {
    const layer = createPlacedEmoji(IDS.censor, '1f44e', { x: 100, y: 100 }, 64, { x: 0, y: 0, width: 800, height: 600 })
    const replacement = replaceEmoji({ ...layer, transform: { ...layer.transform, rotation: 30 } }, '26a1')
    expect(replacement.payload.grapheme).toBe('⚡')
    expect(replacement.transform.rotation).toBe(30)
    expect(replacement.localBounds).toEqual(layer.localBounds)
    const resized = resizeEmoji(layer, 128)
    expect(resized.transform).toMatchObject({ translateX: 36, translateY: 36, scaleX: 1, scaleY: 1 })
    const corner = resizeLayerGeometry(layer, 'se', { x: 40, y: 20 }, { preserveAspect: true })
    expect(corner.localBounds?.width).toBe(corner.localBounds?.height)
    expect(corner.transform.scaleX).toBe(1)
    expect(() => replaceEmoji(layer, 'missing')).toThrow()
  })
})

// The renderer consumes image origins in world space, including local offsets.
describe('emoji corner resize projection', () => {
  for (const handle of ['nw', 'ne', 'se', 'sw'] as const) {
    for (const size of [40, 96]) {
      for (const rotation of [0, 37]) {
        for (const scaleX of [1, -1]) {
          it(`keeps painted geometry on the frame: ${handle}, ${size}px, ${rotation}°, scaleX=${scaleX}`, () => {
            const placed = createPlacedEmoji(IDS.censor, '1f525', { x: 200, y: 200 }, 64, { x: 0, y: 0, width: 800, height: 600 })
            const before = { ...placed, transform: { ...placed.transform, rotation, scaleX } }
            const matrix = transformToMatrix(before.transform)
            const opposite = { x: handle.includes('w') ? 64 : 0, y: handle.includes('n') ? 64 : 0 }
            const corner = { x: opposite.x + (handle.includes('w') ? -size : size), y: opposite.y + (handle.includes('n') ? -size : size) }
            const after = resizeLayerGeometry(before, handle, transformPoint(matrix, corner), { preserveAspect: true })
            const b = after.localBounds!
            const expectedOrigin = transformPoint(matrix, { x: b.x, y: b.y })
            const node = createDocumentRenderScene({ ...baseDocument(), layers: [after] }).nodes[0]!
            if (node.kind !== 'image') throw new Error('expected emoji image')
            expect(node.x).toBeCloseTo(expectedOrigin.x)
            expect(node.y).toBeCloseTo(expectedOrigin.y)
            expect(node.width).toBeCloseTo(size)
            expect(node.height).toBeCloseTo(size)
            const fixed = transformPoint(transformToMatrix(after.transform), {
              x: b.x + (handle.includes('w') ? b.width : 0),
              y: b.y + (handle.includes('n') ? b.height : 0),
            })
            expect(fixed.x).toBeCloseTo(transformPoint(matrix, opposite).x)
            expect(fixed.y).toBeCloseTo(transformPoint(matrix, opposite).y)
          })
        }
      }
    }
  }

  it.each([1, -1])('keeps the world centre when the panel resizes offset bounds with scaleX=%s', (scaleX) => {
    const placed = createPlacedEmoji(IDS.censor, '1f525', { x: 200, y: 200 }, 64, { x: 0, y: 0, width: 800, height: 600 })
    const layer = { ...placed, transform: { ...placed.transform, rotation: 37, scaleX } }
    const before = resizeLayerGeometry(layer, 'sw', transformPoint(transformToMatrix(layer.transform), { x: -32, y: 96 }), { preserveAspect: true })
    if (before.kind !== 'emoji') throw new Error('expected emoji')
    const b = before.localBounds!
    const center = transformPoint(transformToMatrix(before.transform), { x: b.x + b.width / 2, y: b.y + b.height / 2 })
    const after = resizeEmoji(before, 48)
    const nextCenter = transformPoint(transformToMatrix(after.transform), { x: 24, y: 24 })
    expect(nextCenter.x).toBeCloseTo(center.x)
    expect(nextCenter.y).toBeCloseTo(center.y)
    const history = new CommandManager({ ...baseDocument(), layers: [before] })
    history.execute({ type: 'updateLayer', before, after })
    history.undo()
    expect(history.snapshot.document.layers).toEqual([before])
    history.redo()
    expect(history.snapshot.document.layers).toEqual([after])
  })
})

it.each(['nw', 'ne', 'se', 'sw'] as const)('keeps the world centre for Alt %s resize', (handle) => {
  const placed = createPlacedEmoji(IDS.censor, '1f525', { x: 200, y: 200 }, 64, { x: 0, y: 0, width: 800, height: 600 })
  const before = { ...placed, transform: { ...placed.transform, rotation: 37, scaleY: -1 } }
  const matrix = transformToMatrix(before.transform)
  const after = resizeLayerGeometry(before, handle, transformPoint(matrix, {
    x: handle.includes('w') ? -16 : 80, y: handle.includes('n') ? -16 : 80,
  }), { preserveAspect: true, fromCenter: true })
  const b = after.localBounds!
  expect(b.width).toBeCloseTo(96)
  const center = transformPoint(transformToMatrix(after.transform), { x: b.x + b.width / 2, y: b.y + b.height / 2 })
  expect(center.x).toBeCloseTo(transformPoint(matrix, { x: 32, y: 32 }).x)
  expect(center.y).toBeCloseTo(transformPoint(matrix, { x: 32, y: 32 }).y)
  const node = createDocumentRenderScene({ ...baseDocument(), layers: [after] }).nodes[0]!
  const origin = transformPoint(matrix, b)
  if (node.kind !== 'image') throw new Error('expected emoji image')
  expect(node.x).toBeCloseTo(origin.x)
  expect(node.y).toBeCloseTo(origin.y)
})
