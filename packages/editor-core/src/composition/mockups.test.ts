import {
  describe,
  expect,
  it,
} from 'vitest'
import { documentFixture } from '../document/scene/test-kit'
import { createDocumentRenderScene } from '../document/scene'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from '../document/codec'
import { createComposition } from './defaults'
import {
  resolveCompositionLayout,
  contentToCard,
  cardToContent,
} from './layout'
import { compositionInteractionSpace } from './interaction'
import { phoneCamera } from './frame-catalog'

function fixture(patch: Record<string, unknown> = {}) {
  const base = createComposition('phone')
  return { ...documentFixture,
    layers: documentFixture.layers.map((layer) => layer.kind === 'image'
      ? { ...layer, payload: { ...layer.payload, crop: null, mask: null, border: null, radius: 0 } } : layer),
    presentation: { ...documentFixture.presentation,
      composition: { ...base, frame: { ...base.frame, ...patch } } } }
}

describe('device mockup contracts', () => {
  it.each(['portrait', 'landscape'] as const)('keeps notch attachment corners square in %s', (orientation) => {
    const doc = fixture({ phoneModel: 'iphone-notch', orientation, phoneContentMode: 'fullscreen', fit: 'cover' })
    const layout = resolveCompositionLayout(doc)
    const camera = phoneCamera(doc.presentation.composition.frame, layout.screen)
    const inset = Math.min(camera.width, camera.height) * 0.03
    const joined = { x: Math.max(camera.x, layout.screen.x) + inset,
      y: Math.max(camera.y, layout.screen.y) + inset }
    const free = orientation === 'portrait'
      ? { x: camera.x + inset, y: camera.y + camera.height - inset }
      : { x: camera.x + camera.width - inset, y: camera.y + inset }
    expect(compositionInteractionSpace(doc, joined)).toBe('card')
    expect(compositionInteractionSpace(doc, free)).toBe('content')
    expect(createDocumentRenderScene(doc).nodes.find((node) => node.id === 'card:phone:camera')?.kind).toBe('vector')
  })
  it('uses the Tabler wifi and battery-3 contours at equal size without tiny percentage text', () => {
    const nodes = createDocumentRenderScene(fixture({ phoneSystemDetails: true })).nodes
    const wifi = nodes.find((node) => node.id === 'card:phone:wifi')
    const battery = nodes.find((node) => node.id === 'card:phone:battery')
    if (wifi?.kind !== 'vector' || battery?.kind !== 'vector') throw new Error('Tabler status icons')
    expect(wifi.width).toBe(battery.width)
    expect(wifi.height).toBe(battery.height)
    expect(wifi.y).toBe(battery.y)
    expect(wifi.strokeWidth).toBe(battery.strokeWidth)
    expect(wifi.outline.filter((command) => command[0] === 'M')).toHaveLength(4)
    expect(battery.outline.filter((command) => command[0] === 'M')).toHaveLength(4)
    expect(wifi.outline.some((command) => command[0] === 'C')).toBe(true)
    expect(nodes.some((node) => node.id === 'card:phone:charge')).toBe(false)
  })
  it('upgrades legacy phones without changing serialized input', () => {
    const raw = fixture()
    const before = serializeEditorDocument(raw)
    const parsed = parseEditorDocument(JSON.parse(before))
    if (parsed.kind !== 'editable') throw new Error('editable')
    expect(serializeEditorDocument(parsed.document)).toBe(before)
    expect(createDocumentRenderScene(parsed.document).nodes.some((n) => n.id === 'card:phone:camera')).toBe(true)
  })
  it.each(['phoneModel', 'browserStyle', 'phoneSystemDetails', 'phoneContentMode'])(
    'rejects invalid %s', (key) => {
      expect(() => parseEditorDocument(fixture({ [key]: 'invalid' }))).toThrow(key)
    })
  it.each(['portrait', 'landscape'] as const)('reserves camera/status space in %s without rotating source', (orientation) => {
    const doc = fixture({ orientation, phoneSystemDetails: true })
    const layout = resolveCompositionLayout(doc)
    expect(layout.viewport.width).toBeLessThan(layout.screen.width)
    expect(layout.viewport.height).toBeLessThan(layout.screen.height)
    expect(layout.content.width / layout.content.height).toBeCloseTo(doc.canvas.width / doc.canvas.height)
    const point = { x: 45, y: 80 }
    expect(cardToContent(contentToCard(point, layout), layout).x).toBeCloseTo(point.x)
    expect(compositionInteractionSpace(doc, { x: layout.screen.x + 1, y: layout.screen.y + 1 })).toBe('card')
    const full = resolveCompositionLayout(fixture({ orientation, phoneContentMode: 'fullscreen' }))
    expect(full.viewport).toEqual(full.screen)
    const nodes = createDocumentRenderScene(doc).nodes
    expect(nodes.findIndex((n) => n.id === 'card:phone:camera')).toBeGreaterThan(nodes.findIndex((n) => n.id === 'card:content'))
    expect(nodes.some((n) => n.kind === 'text' && n.text === '9:41')).toBe(true)
  })
  it('gives all four models distinct geometry and persists options', () => {
    const radii = new Set<number>()
    for (const phoneModel of ['iphone-island', 'iphone-notch', 'android-rounded', 'android-angular']) {
      const doc = fixture({ phoneModel, phoneSystemDetails: true, phoneContentMode: 'fullscreen' })
      const parsed = parseEditorDocument(JSON.parse(serializeEditorDocument(doc)))
      if (parsed.kind !== 'editable') throw new Error('editable')
      expect(parsed.document.presentation.composition!.frame.phoneModel).toBe(phoneModel)
      const frame = createDocumentRenderScene(doc).nodes.find((n) => n.id === 'card:frame')
      if (frame?.kind !== 'rect') throw new Error('frame')
      radii.add(frame.cornerRadius!)
    }
    expect(radii.size).toBeGreaterThanOrEqual(3)
  })
  it.each(['retro-windows', 'retro-mac'] as const)('renders %s with its own chrome and title/URL', (browserStyle) => {
    const doc = fixture({ kind: 'browser', browserStyle, title: 'My page', url: 'example.test' })
    const layout = resolveCompositionLayout(doc)
    expect(layout.screen.y - layout.frame.y).toBeGreaterThan(40)
    const nodes = createDocumentRenderScene(doc).nodes
    expect(nodes.some((n) => n.id === 'card:browser:address')).toBe(true)
    expect(nodes.some((n) => n.kind === 'text' && n.text === 'My page')).toBe(true)
    expect(nodes.some((n) => n.kind === 'text' && n.text === 'example.test')).toBe(true)
  })
})
