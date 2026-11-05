import {
  describe,
  expect,
  it,
} from 'vitest'
import { documentFixture as sceneFixture } from '../document/scene/test-kit'
import { createDocumentRenderScene } from '../document/scene'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from '../document/codec'
import { CommandManager } from '../commands/manager'
import { createComposition } from './defaults'
import { resolveCompositionLayout } from './layout'
import { createFramePreview } from './frame-preview'

const documentFixture = { ...sceneFixture, layers: sceneFixture.layers.map((layer) => layer.kind === 'image'
  ? { ...layer, payload: { ...layer.payload, crop: null, mask: null, border: null, radius: 0 } } : layer) }

describe('simple retro windows', () => {
  it.each([['retro-windows', 32], ['retro-mac', 28]] as const)('renders %s as a title bar without browser chrome', (windowStyle, chrome) => {
    const base = createComposition()
    const composition = { ...base, frame: { ...base.frame, kind: 'window' as const, windowStyle, title: 'My window', url: 'ignored.test' } }
    const doc = { ...documentFixture, presentation: { ...documentFixture.presentation, composition } }
    const layout = resolveCompositionLayout(doc)
    expect(layout.screen.y - layout.frame.y).toBeCloseTo(chrome)
    const nodes = createDocumentRenderScene(doc).nodes
    expect(nodes.some((node) => node.id.includes('address') || node.id.includes(':nav:'))).toBe(false)
    expect(nodes.some((node) => node.kind === 'text' && node.text === 'My window')).toBe(true)
    expect(nodes.some((node) => node.kind === 'text' && node.text === 'ignored.test')).toBe(false)
    expect(nodes.find((node) => node.id === 'card:frame')).toMatchObject({ cornerRadius: 0 })
    expect(createFramePreview(composition.frame).height).toBe(180 + chrome)
    const manager = new CommandManager(documentFixture)
    manager.execute({ type: 'setPresentation', before: documentFixture.presentation, after: doc.presentation })
    const parsed = parseEditorDocument(JSON.parse(serializeEditorDocument(manager.snapshot.document)))
    if (parsed.kind !== 'editable') throw new Error('editable')
    expect(parsed.document.presentation.composition!.frame.windowStyle).toBe(windowStyle)
    manager.undo()
    expect(manager.snapshot.document).toEqual(documentFixture)
    manager.redo()
    expect(manager.snapshot.document.presentation).toEqual(doc.presentation)
  })
  it.each(['retro-windows', 'retro-mac'] as const)('uses a closed house outline for %s browser navigation', (browserStyle) => {
    const base = createComposition('browser')
    const doc = { ...documentFixture, presentation: { ...documentFixture.presentation,
      composition: { ...base, frame: { ...base.frame, browserStyle } } } }
    const home = createDocumentRenderScene(doc).nodes.find((node) => node.id === 'card:browser:home')
    expect(home?.kind).toBe('path')
    if (home?.kind !== 'path') throw new Error('home')
    expect(home.points).toHaveLength(12)
    expect(home.points[0]).toEqual(home.points.at(-1))
  })
})
