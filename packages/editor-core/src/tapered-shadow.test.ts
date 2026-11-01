import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from './drawing'
import { createDocumentRenderScene } from './document/scene'
import { documentFixture } from './document/scene/test-kit'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from './document/codec'
import {
  applyLayerStyle,
  extractLayerStyle,
} from './styles'
import { hitTestDocument } from './hit-test'
import type { ArrowLayer } from './document/types'
import { createTextLayer } from './tools/content/text'
import { styleCommand } from './styles'
import {
  applyEditorCommand,
  revertEditorCommand,
} from './commands/operations'
import { rebaseArrowLayer } from './arrow-geometry'
import { flattenShapePath } from './shapes'
import { createTextCommitCommand } from './tools/content/commands'
import { taperedArrowMetrics } from './tapered-arrow'

function arrow(): ArrowLayer {
  return createDrawingLayer({ id: '019c1f62-058e-7000-8000-000000000004', tool: 'arrow',
    start: { x: 60, y: 150 }, end: { x: 360, y: 150 }, defaults: {
      ...DEFAULT_DRAWING_DEFAULTS, arrow: { ...DEFAULT_DRAWING_DEFAULTS.arrow, appearance: 'tapered' },
    } })! as ArrowLayer
}

describe('tapered arrows and annotation shadows', () => {
  it('keeps an elbow head on its terminal segment and a shaft inside the route corridor', () => {
    const original = arrow()
    const payload = { ...original.payload, path: 'elbow' as const,
      start: { x: 0, y: 0 }, end: { x: 200, y: 100 }, elbow: { axis: 'x' as const, offset: 45 } }
    const { sizes, body } = taperedArrowMetrics(payload)
    expect(sizes.end).toBeLessThanOrEqual(4)
    expect(body.at(-1)!.x).toBe(200)
    const layer = rebaseArrowLayer({ ...original, transform: { ...original.transform, translateX: 0, translateY: 0 } }, { ...payload, elbow: { axis: 'x', offset: 0 } })
    const scene = createDocumentRenderScene({ ...documentFixture, layers: [layer] })
    const doc = { ...documentFixture, layers: [layer] }
    // Both straight legs stay filled right up to the 90° corner.
    expect(hitTestDocument(doc, { x: 0, y: 45 })?.nodeId).toBe(layer.id)
    expect(hitTestDocument(doc, { x: 5, y: 50 })?.nodeId).toBe(layer.id)
    expect(scene.nodes[0]?.kind).toBe('vector')
  })
  it('creates a filled tapered silhouette with a wider head and precise fill hit testing', () => {
    const layer = arrow()
    expect(layer.payload.appearance).toBe('tapered')
    const document = { ...documentFixture, canvas: { width: 500, height: 300 }, layers: [layer] }
    const scene = createDocumentRenderScene(document)
    expect(scene.nodes[0]).toMatchObject({ kind: 'vector', open: false })
    expect(hitTestDocument(document, { x: 280, y: 157 })?.nodeId).toBe(layer.id)
    expect(hitTestDocument(document, { x: 80, y: 162 })).toBeUndefined()
    const restored = parseEditorDocument(serializeEditorDocument(document))
    expect(restored).toMatchObject({ kind: 'editable', document: { layers: [{ payload: { appearance: 'tapered' } }] } })
  })

  it('persists an optional shadow, transfers it as style and groups the whole silhouette', () => {
    const layer = applyLayerStyle(arrow(), { annotationShadow: 'soft' })
    expect(layer).toHaveProperty('annotationShadow', 'soft')
    expect(extractLayerStyle(layer)).toHaveProperty('annotationShadow', 'soft')
    const document = { ...documentFixture, canvas: { width: 500, height: 300 }, layers: [layer] }
    const scene = createDocumentRenderScene(document)
    expect(scene.nodes[0]).toMatchObject({ kind: 'group', tint: { red: 0, green: 0, blue: 0 }, blur: 6 })
    expect(scene.nodes[1]).toMatchObject({ kind: 'vector' })
    expect(parseEditorDocument(serializeEditorDocument(document))).toMatchObject({
      kind: 'editable', document: { layers: [{ annotationShadow: 'soft' }] },
    })
    expect(applyLayerStyle(layer, { annotationShadow: 'none' })).not.toHaveProperty('annotationShadow')
  })

  it.each(['straight', 'quadratic', 'elbow'] as const)('keeps %s ink finite inside rebased bounds, even on short and reversed arrows', (path) => {
    for (const distance of [.01, 4, 30, 400, -400]) {
      const original = arrow()
      const layer = rebaseArrowLayer(original, { ...original.payload, path,
        end: { x: original.payload.start.x + distance, y: original.payload.start.y + distance / 3 },
        ...(path === 'quadratic' ? { bend: { x: original.payload.start.x + distance / 2, y: original.payload.start.y - distance / 2 } } : {}),
        ...(path === 'elbow' ? { elbow: { axis: 'x', offset: 0 } } : {}),
      })
      const scene = createDocumentRenderScene({ ...documentFixture, layers: [layer] })
      const node = scene.nodes[0]!
      expect(node.kind).toBe('vector')
      if (node.kind !== 'vector') throw new Error('tapered vector expected')
      for (const p of flattenShapePath(node.outline).flat()) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
        expect(p.x - layer.transform.translateX).toBeGreaterThanOrEqual(-.001)
        expect(p.x - layer.transform.translateX).toBeLessThanOrEqual(layer.localBounds.width + .001)
        expect(p.y - layer.transform.translateY).toBeGreaterThanOrEqual(-.001)
        expect(p.y - layer.transform.translateY).toBeLessThanOrEqual(layer.localBounds.height + .001)
      }
    }
  })

  it('shadows text and arrows as one undoable group without restoring removed text effects', () => {
    const text = createTextLayer({ id: '019c1f62-058e-7000-8000-000000000005', text: 'Тень', origin: { x: 50, y: 40 } })!
    const document = { ...documentFixture, layers: [arrow(), text] }
    const command = styleCommand(document.layers, { annotationShadow: 'strong' })!
    const changed = applyEditorCommand(document, command)
    expect(changed.layers.every((layer) => layer.annotationShadow === 'strong')).toBe(true)
    expect(revertEditorCommand(changed, command)).toEqual(document)
    expect(parseEditorDocument(serializeEditorDocument(changed))).toMatchObject({ kind: 'editable', document: { layers: [{ annotationShadow: 'strong' }, { annotationShadow: 'strong' }] } })
    const scene = createDocumentRenderScene(changed)
    expect(scene.nodes.filter((node) => node.kind === 'group')).toHaveLength(2)
    expect(changed.layers[1]).not.toHaveProperty('shadows')
    expect(() => parseEditorDocument({ ...changed, layers: [{ ...changed.layers[1], annotationShadow: 'invalid' }] })).toThrow('annotationShadow')
  })

  it('retains dash gaps in precise hit tests and keeps line appearance independent', () => {
    for (const style of ['dashed', 'dotted'] as const) {
      const original = arrow()
      const layer = rebaseArrowLayer(original, { ...original.payload, stroke: { ...original.payload.stroke, style } })
      const document = { ...documentFixture, layers: [layer] }
      expect(hitTestDocument(document, { x: 61, y: 150 })?.nodeId).toBe(layer.id)
      expect(hitTestDocument(document, { x: style === 'dotted' ? 80 : 95, y: 150 })).toBeUndefined()
    }
    const line = createDrawingLayer({ id: '019c1f62-058e-7000-8000-000000000006', tool: 'line', start: { x: 10, y: 10 }, end: { x: 200, y: 100 } })! as ArrowLayer
    expect(applyLayerStyle(line, extractLayerStyle(arrow())).payload.appearance).toBe('clean')
  })

  it('keeps independent outlined caps inside bounds and selectable on their visible ink', () => {
    const original = arrow()
    const layer = rebaseArrowLayer(original, { ...original.payload, endCap: 'triangle' })
    const document = { ...documentFixture, layers: [layer] }
    const cap = createDocumentRenderScene(document).nodes.find((node) => node.id.endsWith(':end-cap'))!
    if (cap.kind !== 'polygon') throw new Error('outlined cap expected')
    const edge = cap.points[1]!
    expect(edge.y - layer.transform.translateY).toBeLessThanOrEqual(layer.localBounds.height)
    expect(hitTestDocument(document, edge)?.nodeId).toBe(layer.id)
  })

  it('preserves the shadow when inline text is rebuilt and committed', () => {
    const existing = { ...createTextLayer({ id: '019c1f62-058e-7000-8000-000000000007', text: 'Before', origin: { x: 50, y: 40 } })!, annotationShadow: 'strong' as const }
    const next = createTextLayer({ id: existing.id, text: 'After', origin: { x: 50, y: 40 } })!
    const command = createTextCommitCommand({ existing, next })!
    const document = { ...documentFixture, layers: [existing] }
    const edited = applyEditorCommand(document, command)
    expect(edited.layers[0]).toHaveProperty('annotationShadow', 'strong')
    expect(revertEditorCommand(edited, command)).toEqual(document)
  })

  it('does not transfer the annotation effect to pixel-processing tools or highlighter', () => {
    const marker = createDrawingLayer({ id: '019c1f62-058e-7000-8000-000000000008', tool: 'marker', start: { x: 10, y: 10 }, end: { x: 200, y: 100 } })!
    expect(applyLayerStyle(marker, { annotationShadow: 'soft' })).not.toHaveProperty('annotationShadow')
    const invalid = { ...documentFixture, layers: [{ ...marker, annotationShadow: 'soft' }] }
    expect(() => parseEditorDocument(invalid)).toThrow('annotationShadow')
    expect(createDocumentRenderScene(invalid as typeof documentFixture).nodes.some((node) => node.kind === 'group')).toBe(false)
  })
})
