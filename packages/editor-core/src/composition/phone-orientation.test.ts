import {
  describe,
  expect,
  it,
} from 'vitest'
import { createComposition } from './defaults'
import { updateCompositionPresentation } from './phone-orientation'
import { documentFixture as sceneFixture } from '../document/scene/test-kit'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from '../document/codec'
import { CommandManager } from '../commands/manager'

const documentFixture = { ...sceneFixture, layers: sceneFixture.layers.map((layer) => layer.kind === 'image'
  ? { ...layer, payload: { ...layer.payload, crop: null, mask: null, border: null, radius: 0 } } : layer) }

describe('first phone orientation', () => {
  it.each([
    [3840, 2160, 'landscape'],
    [1080, 2400, 'portrait'],
    [1440, 1440, 'portrait'],
  ] as const)('matches %s × %s once', (width, height, orientation) => {
    const document = { ...documentFixture, canvas: { width, height } }
    const after = updateCompositionPresentation(document, createComposition('phone'))
    expect(after.composition?.frame.orientation).toBe(orientation)
    expect(after.phoneOrientation).toBe(orientation)
    expect(document.presentation.composition).toBeUndefined()
  })

  it('uses visible crop instead of original image or output card', () => {
    const document = { ...documentFixture, crop: { x: 10, y: 10, width: 200, height: 400 } }
    expect(updateCompositionPresentation(document, createComposition('phone')).phoneOrientation).toBe('portrait')
  })

  it('remembers manual orientation across frame changes, removal, persistence and crop', () => {
    const phone = createComposition('phone')
    let document = { ...documentFixture, presentation: updateCompositionPresentation(documentFixture, phone) }
    expect(document.presentation.phoneOrientation).toBe('landscape')
    document = { ...document, presentation: updateCompositionPresentation(document,
      { ...phone, frame: { ...phone.frame, orientation: 'portrait' } }) }
    document = { ...document, presentation: updateCompositionPresentation(document, createComposition('browser')) }
    document = { ...document, presentation: updateCompositionPresentation(document, undefined) }
    const restored = parseEditorDocument(JSON.parse(serializeEditorDocument(document)))
    if (restored.kind !== 'editable') throw new Error('editable document expected')
    const next = updateCompositionPresentation(restored.document, phone)
    expect(next.phoneOrientation).toBe('portrait')
    expect(next.composition?.frame.orientation).toBe('portrait')
    const cropped = { ...restored.document, crop: { x: 0, y: 0, width: 200, height: 400 }, presentation: next }
    expect(updateCompositionPresentation(cropped, next.composition).composition?.frame.orientation).toBe('portrait')
  })

  it('preserves legacy phones and explicit presets', () => {
    const phone = createComposition('phone')
    const legacy = { ...documentFixture, presentation: { ...documentFixture.presentation, composition: phone } }
    expect(updateCompositionPresentation(legacy, phone).composition?.frame.orientation).toBe('portrait')
    expect(updateCompositionPresentation(documentFixture, phone, false).phoneOrientation).toBe('portrait')
    const removed = updateCompositionPresentation(legacy, undefined)
    expect(removed.phoneOrientation).toBe('portrait')
  })

  it('commits and undoes orientation together with the frame', () => {
    const manager = new CommandManager(documentFixture)
    const before = manager.snapshot.document.presentation
    const after = updateCompositionPresentation(manager.snapshot.document, createComposition('phone'))
    manager.execute({ type: 'setPresentation', before, after })
    expect(manager.snapshot.document.presentation.phoneOrientation).toBe('landscape')
    manager.undo()
    expect(manager.snapshot.document.presentation).toEqual(before)
    manager.redo()
    expect(manager.snapshot.document.presentation).toEqual(after)
  })

  it('rejects malformed persisted orientation', () => {
    const raw = JSON.parse(serializeEditorDocument(documentFixture))
    raw.presentation.phoneOrientation = 'sideways'
    expect(() => parseEditorDocument(raw)).toThrow(/phoneOrientation/u)
  })
})
