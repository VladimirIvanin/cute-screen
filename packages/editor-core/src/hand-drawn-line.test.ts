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
  parseDrawingToolPreferences,
  defaultDrawingToolPreferences,
} from './drawing-preferences'
import {
  applyLayerStyle,
  extractLayerStyle,
} from './styles'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from './document/codec'
import { createDocumentRenderScene } from './document/scene'
import { documentFixture } from './document/scene/test-kit'
import { arrowBodyGeometry } from './arrow-geometry'
import { hitTestDocument } from './hit-test'
import type { ArrowLayer } from './document/types'

function line(
  id = '019c1f62-058e-7000-8000-000000000010',
  appearance: 'clean' | 'handDrawn' = 'handDrawn',
): ArrowLayer {
  return createDrawingLayer({
    id, tool: 'line', start: { x: 20, y: 30 }, end: { x: 400, y: 170 },
    defaults: { ...DEFAULT_DRAWING_DEFAULTS,
      line: { ...DEFAULT_DRAWING_DEFAULTS.line, appearance },
    },
  }) as ArrowLayer
}

describe('hand-drawn standalone line', () => {
  it('creates a seeded cubic stroke without caps and hits the same visible path', () => {
    const layer = line()
    expect(layer.payload).toMatchObject({ annotationTool: 'line', appearance: 'handDrawn',
      path: 'straight', startCap: 'none', endCap: 'none', sketchVersion: 1 })
    expect(layer.payload.sketchSeed).toBeGreaterThan(0)
    expect(line('019c1f62-058e-7000-8000-000000000011').payload.sketchSeed).not.toBe(layer.payload.sketchSeed)
    const body = arrowBodyGeometry(layer.payload)
    expect(body.path.some((command) => command[0] === 'C')).toBe(true)
    expect(body.points[0]).toEqual(layer.payload.start)
    expect(body.points.at(-1)).toEqual(layer.payload.end)
    const document = { ...documentFixture, layers: [layer] }
    expect(createDocumentRenderScene(document).nodes[0]!.kind).toBe('vector')
    const sample = body.points[Math.floor(body.points.length / 2)]!
    expect(hitTestDocument(document, { x: sample.x + layer.transform.translateX,
      y: sample.y + layer.transform.translateY })).toBeDefined()
  })

  it('reopens hand-drawn lines with the exact scene while legacy lines remain clean', () => {
    const document = { ...documentFixture, layers: [line()] }
    const parsed = parseEditorDocument(JSON.parse(serializeEditorDocument(document)))
    expect(parsed.kind).toBe('editable')
    if (parsed.kind !== 'editable') throw new Error('Expected editable document')
    expect(createDocumentRenderScene(parsed.document)).toEqual(createDocumentRenderScene(document))
    const clean = line(undefined, 'clean')
    const { appearance: _appearance, sketchSeed: _seed, sketchVersion: _version, ...payload } = clean.payload
    void [_appearance, _seed, _version]
    expect(createDocumentRenderScene({ ...documentFixture, layers: [{ ...clean, payload }] }).nodes[0]!.kind).toBe('path')
  })

  it('transfers appearance to lines, retaining the receiving seed and keeping caps absent', () => {
    const source = line()
    const target = line('019c1f62-058e-7000-8000-000000000011', 'clean')
    expect(extractLayerStyle(source).appearance).toBe('handDrawn')
    const styled = applyLayerStyle(target, { ...extractLayerStyle(source), startCap: 'circle', endCap: 'solidArrow' })
    expect(styled.payload).toMatchObject({ appearance: 'handDrawn', startCap: 'none', endCap: 'none' })
    expect(styled.payload.sketchSeed).toBe(target.payload.sketchSeed)
    expect(applyLayerStyle(styled, { appearance: 'clean' }).payload.sketchSeed).toBe(target.payload.sketchSeed)
  })

  it('remembers line appearance independently and excludes instance seeds from defaults', () => {
    const defaults = defaultDrawingToolPreferences()
    const parsed = parseDrawingToolPreferences({ ...defaults, defaults: { ...defaults.defaults,
      line: { ...defaults.defaults.line, appearance: 'handDrawn', sketchSeed: 123, sketchVersion: 1 },
    } })
    expect(parsed.defaults.line.appearance).toBe('handDrawn')
    expect(parsed.defaults.line).not.toHaveProperty('sketchSeed')
    expect(parsed.defaults.line).not.toHaveProperty('sketchVersion')
    expect(parsed.defaults.arrow.appearance).toBe('clean')
  })
})
