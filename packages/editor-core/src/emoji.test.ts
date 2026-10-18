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
