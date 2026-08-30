import { createEditorDocumentFromImage } from './document/factory'
import type { EditorDocument } from './document/types'
import { createCensorLayer } from './tools/precision/censor'
import { createLoupeLayer } from './tools/precision/loupe'
import { createRulerLayer } from './tools/precision/ruler'
import { createSpotlightLayer } from './tools/precision/spotlight'

export const IDS = {
  document: '019c1f62-058e-7000-8000-000000000000',
  base: '019c1f62-058e-7000-8000-000000000001',
  censor: '019c1f62-058e-7000-8000-000000000002',
  spotlight: '019c1f62-058e-7000-8000-000000000003',
  ruler: '019c1f62-058e-7000-8000-000000000004',
  loupe: '019c1f62-058e-7000-8000-000000000005',
} as const

export const source = {
  blobHash: 'a'.repeat(64),
  format: 'png' as const,
  mimeType: 'image/png',
  width: 800,
  height: 600,
  orientationApplied: true as const,
  provenance: 'capture' as const,
  color: { colorSpace: 'srgb' as const, hasIccProfile: false },
}
export const CANVAS = { width: source.width, height: source.height } as const

export function baseDocument(): EditorDocument {
  return createEditorDocumentFromImage({
    id: IDS.document,
    baseLayerId: IDS.base,
    source,
    timestamp: '2026-08-15T00:00:00.000Z',
  })
}

export function withLayers(layers: EditorDocument['layers']): EditorDocument {
  return { ...baseDocument(), layers }
}

export function precisionLayers() {
  const censor = createCensorLayer({
    id: IDS.censor,
    region: {
      kind: 'freeform',
      points: [
        { x: 20, y: 30 },
        { x: 100, y: 30 },
        { x: 60, y: 90 },
      ],
    },
    effect: { mode: 'pixelate', blockSize: 12 },
  })
  const spotlight = createSpotlightLayer({
    id: IDS.spotlight,
    bounds: { x: 140, y: 40, width: 120, height: 80 },
    shape: 'ellipse',
    dimColor: { red: 0.05, green: 0.08, blue: 0.12, alpha: 1 },
    dimOpacity: 0.7,
    feather: 'soft',
  })
  const ruler = createRulerLayer({
    id: IDS.ruler,
    canvas: CANVAS,
    start: { x: 300, y: 100 },
    end: { x: 420, y: 190 },
    unit: 'percent',
    snapAngleIncrementDegrees: 15,
  })
  const loupe = createLoupeLayer({
    id: IDS.loupe,
    canvas: CANVAS,
    sourceRegion: { x: 80, y: 100, width: 60, height: 60 },
    destination: { x: 500, y: 260 },
    zoom: 3,
    size: 180,
    shape: 'circle',
    borderColor: { red: 1, green: 0.8, blue: 0.2, alpha: 1 },
    borderWidth: 4,
    shadow: {
      color: { red: 0, green: 0, blue: 0, alpha: 0.4 },
      offsetX: 0,
      offsetY: 8,
      blur: 16,
    },
  })
  return { censor, spotlight, ruler, loupe }
}
