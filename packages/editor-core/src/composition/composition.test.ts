import {
  describe,
  expect,
  it,
} from 'vitest'
import { documentFixture as sceneFixture } from '../document/scene/test-kit'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from '../document/codec'
import { createDocumentRenderScene } from '../document/scene'
import { createRulerLayer } from '../tools/precision/ruler'
import { CommandManager } from '../commands/manager'
import {
  createComposition,
  resolveCompositionLayout,
  contentToCard,
  cardToContent,
  createCardBranding,
  resolveBrandingYear,
  compositionPreset,
} from './index'

const documentFixture = { ...sceneFixture, layers: sceneFixture.layers.map((layer) => layer.kind === 'image' ? { ...layer, payload: { ...layer.payload, crop: null, mask: null, border: null, radius: 0 } } : layer) }

describe('publication card contract', () => {
  it('opens v7 without mutating its raw object and serializes edits as v8', () => {
    const raw = { ...structuredClone(documentFixture), schemaVersion: 7 }
    const before = JSON.stringify(raw)
    const parsed = parseEditorDocument(raw)
    expect(parsed.kind).toBe('editable')
    if (parsed.kind !== 'editable') throw new Error('editable')
    expect(parsed.document.schemaVersion).toBe(8)
    expect(JSON.stringify(raw)).toBe(before)
    expect(JSON.parse(serializeEditorDocument(parsed.document)).schemaVersion).toBe(8)
  })
  it('keeps source geometry through asymmetric margins, crop and undo', () => {
    const manager = new CommandManager({ ...documentFixture, crop: { x: 20, y: 30, width: 400, height: 300 } })
    const before = manager.snapshot.document.presentation
    const composition = createComposition('footer')
    const after = { ...before, composition }
    manager.execute({ type: 'setPresentation', before, after })
    const layout = resolveCompositionLayout(manager.snapshot.document)
    expect(layout.width).toBe(400)
    expect(layout.height).toBeGreaterThan(300)
    expect(layout.content.x).toBe(0)
    expect(layout.footer.height).toBeGreaterThan(0)
    const card = contentToCard({ x: 95, y: 72 }, layout)
    expect(cardToContent(card, layout)).toEqual({ x: 95, y: 72 })
    expect(manager.snapshot.document.layers).toEqual(documentFixture.layers)
    manager.undo()
    expect(manager.snapshot.document.presentation).toEqual(before)
    manager.redo()
    expect(manager.snapshot.document.presentation).toEqual(after)
  })
  it('fits phone content without distortion and never rotates pixels', () => {
    const portrait = createComposition('phone')
    const doc = { ...documentFixture, presentation: { ...documentFixture.presentation, composition: portrait } }
    const a = resolveCompositionLayout(doc)
    const b = resolveCompositionLayout({ ...doc, presentation: { ...doc.presentation,
      composition: { ...portrait, frame: { ...portrait.frame, orientation: 'landscape' } } } })
    expect(a.screen.height).toBeGreaterThan(a.screen.width)
    expect(b.screen.width).toBeGreaterThan(b.screen.height)
    expect(a.content.width / a.content.height).toBeCloseTo(800 / 600)
    expect(b.content.width / b.content.height).toBeCloseTo(800 / 600)
  })
  it('composes signature opacity as an isolated block and displays both browser fields', () => {
    const start = createComposition('browser')
    const branding = { ...createCardBranding('brand', 2026), text: '© 2026', opacity: 0.5,
      backplate: { red: 1, green: 1, blue: 1, alpha: 1 } }
    const scene = createDocumentRenderScene({ ...documentFixture, presentation: { ...documentFixture.presentation,
      composition: { ...start, frame: { ...start.frame, title: 'Window title', url: 'example.test' }, branding: [branding] } } })
    expect(scene.nodes.some((node) => node.kind === 'text' && node.text === 'Window title')).toBe(true)
    expect(scene.nodes.some((node) => node.kind === 'text' && node.text === 'example.test')).toBe(true)
    const block = scene.nodes.find((node) => node.id === 'card:brand:brand')
    expect(block?.kind).toBe('group')
    expect(block?.opacity).toBe(0.5)
  })
  it('resizes card ruler badges without moving their endpoints or losing undo', () => {
    const base = createComposition()
    const composition = { ...base, layout: { ...base.layout, mode: 'fixed' as const, width: 900, height: 900 } }
    const ruler = { ...createRulerLayer({ id: '019c1f62-058e-7000-8000-000000000002', canvas: { width: 900, height: 900 },
      start: { x: 50, y: 70 }, end: { x: 400, y: 70 }, unit: 'percent' }), space: 'card' as const }
    const doc = { ...documentFixture, layers: [...documentFixture.layers, ruler],
      presentation: { ...documentFixture.presentation, composition } }
    const manager = new CommandManager(doc)
    manager.execute({ type: 'setPresentation', before: doc.presentation, after: { ...doc.presentation,
      composition: { ...composition, layout: { ...composition.layout, width: 100, height: 100 } } } })
    expect(manager.snapshot.document.layers.at(-1)).toEqual(ruler)
    manager.undo()
    expect(manager.snapshot.document).toEqual(doc)
    manager.redo()
    expect(resolveCompositionLayout(manager.snapshot.document).width).toBe(100)
  })
  it('freezes the applied year, excludes window context from presets and explicitly refreshes with undo', () => {
    const composition = createComposition('footer')
    const block = resolveBrandingYear({ ...createCardBranding('brand', 2026), template: '© {year} My channel' }, 2026)
    const settings = { ...composition, frame: { ...composition.frame, title: 'Specific window', url: 'private.example' }, branding: [block] }
    const document = { ...documentFixture, presentation: { ...documentFixture.presentation, composition: settings } }
    const restored = parseEditorDocument(JSON.parse(serializeEditorDocument(document)))
    if (restored.kind !== 'editable') throw new Error('editable')
    expect(restored.document.presentation.composition!.branding[0]!.text).toBe('© 2026 My channel')
    expect(compositionPreset(settings).frame).toMatchObject({ title: '', url: '' })
    const manager = new CommandManager(restored.document)
    const before = manager.snapshot.document.presentation
    manager.execute({ type: 'setPresentation', before, after: { ...before,
      composition: { ...settings, branding: [resolveBrandingYear(block, 2027)] } } })
    expect(manager.snapshot.document.presentation.composition!.branding[0]!.text).toBe('© 2027 My channel')
    manager.undo()
    expect(manager.snapshot.document.presentation.composition!.branding[0]!.text).toBe('© 2026 My channel')
  })
  it.each(['browser', 'window'] as const)('keeps %s content square against the title bar and clips only the external contour', (kind) => {
    const base = createComposition('browser')
    const composition = { ...base, frame: { ...base.frame, kind } }
    const document = { ...documentFixture, presentation: { ...documentFixture.presentation, composition } }
    const node = createDocumentRenderScene(document).nodes.find((entry) => entry.id === 'card:content')
    if (node?.kind !== 'group') throw new Error('content group')
    expect(node.cornerRadius).toBe(0)
    expect(node.outerClip).toEqual({ bounds: resolveCompositionLayout(document).frame, cornerRadius: 12 })
  })
  it.each(['portrait', 'landscape'] as const)('uses the phone body contour for its %s shadow', (orientation) => {
    const base = createComposition('phone')
    const composition = { ...base, frame: { ...base.frame, orientation } }
    const document = { ...documentFixture, presentation: { ...documentFixture.presentation, composition } }
    const nodes = createDocumentRenderScene(document).nodes
    const body = nodes.find((node) => node.id === 'card:frame')
    const shadow = nodes.find((node) => node.id === 'card:shadow:0')
    if (body?.kind !== 'rect' || shadow?.kind !== 'rect') throw new Error('phone body and shadow')
    expect(shadow.cornerRadius).toBeCloseTo(body.cornerRadius! + 1)
    expect(shadow.x).toBe(body.x - 1)
    expect(shadow.y).toBe(body.y + 4)
  })
  it('rejects invalid freeform colors, canvas dimensions and missing band targets', () => {
    const composition = createComposition('padding')
    const raw = { ...documentFixture, schemaVersion: 8, presentation: { ...documentFixture.presentation,
      composition: { ...composition, layout: { ...composition.layout, width: NaN } } } }
    expect(() => parseEditorDocument(raw)).toThrow()
  })
})
