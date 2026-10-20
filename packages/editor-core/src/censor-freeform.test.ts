import {
  describe,
  expect,
  it,
} from 'vitest'
import { createCensorLayer } from './tools/precision/censor'
import {
  assertValidFreeformPolygon,
  pointInPolygon,
} from './tools/precision/polygon'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from './document/codec'
import {
  IDS,
  baseDocument,
  withLayers,
} from './precision-tools.test-kit'

const bowtie = [{ x: 10, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }, { x: 90, y: 10 }]
const square = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]

describe('freeform censor winding paths', () => {
  it.each([[bowtie], [[...square, ...square]]])('constructs and round-trips intersecting paths', (points) => {
    const layer = createCensorLayer({ id: IDS.censor, region: { kind: 'freeform', points } })
    const document = withLayers([baseDocument().layers[0]!, layer])
    expect(parseEditorDocument(serializeEditorDocument(document))).toMatchObject({ kind: 'editable', document })
  })

  it('hits a twice-wound region with the same nonzero rule as both renderers', () => {
    expect(pointInPolygon({ x: 40, y: 40 }, [...square, ...square])).toBe(true)
    expect(pointInPolygon({ x: 5, y: 40 }, [...square, ...square])).toBe(false)
    expect(pointInPolygon({ x: 50, y: 20 }, bowtie)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 50 }, bowtie)).toBe(false)
  })

  it('still rejects nonfinite, collinear and zero-length edges', () => {
    expect(() => assertValidFreeformPolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toThrow()
    expect(() => assertValidFreeformPolygon([...square, square[3]!])).toThrow()
    expect(() => assertValidFreeformPolygon([{ x: NaN, y: 1 }, ...square])).toThrow()
  })
})
