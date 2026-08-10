import { describe, expect, it } from 'vitest'

import {
  createNumberedMarkerLayer,
  createDuplicateLayerCommand,
  createTextCommitCommand,
  createTextLayer,
  decodeClipboardLayersV1,
  encodeClipboardLayersV1,
  nextNumberedMarkerSequence,
  pasteClipboardLayers,
  type EditorDocumentV1,
  type EditorCommand,
  type LayerNode,
} from './index'

const document: EditorDocumentV1 = {
  schemaVersion: 4,
  id: '019c1f62-058e-7000-8000-000000000000',
  source: {
    blobHash: 'a'.repeat(64),
    format: 'png',
    mimeType: 'image/png',
    width: 100,
    height: 100,
    orientationApplied: true,
    provenance: 'capture',
    color: { colorSpace: 'srgb', hasIccProfile: false },
  },
  canvas: { width: 100, height: 100 },
  crop: null,
  layers: [],
  presentation: { beautify: { enabled: false }, watermark: { enabled: false } },
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
}

const ids = [
  '019c1f62-058e-7000-8000-000000000001',
  '019c1f62-058e-7000-8000-000000000002',
  '019c1f62-058e-7000-8000-000000000003',
] as const

describe('M07 content-layer core contracts', () => {
  it('creates portable text with one typed rich-text payload', () => {
    const layer = createTextLayer({
      id: ids[0],
      text: 'Привет\nworld',
      origin: { x: 8, y: 12 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
    })
    if (layer === null) throw new Error('expected non-empty text layer')

    expect(layer.payload.content.text).toBe('Привет\nworld')
    expect(layer.payload.content.wrap).toBe('autoSize')
    expect(layer.payload.fill).toMatchObject({ kind: 'solid' })
  })

  it('allocates the minimal free marker number and preserves duplicates', () => {
    const one = createNumberedMarkerLayer({
      id: ids[0],
      sequence: 1,
      origin: { x: 0, y: 0 },
    })
    const three = createNumberedMarkerLayer({
      id: ids[1],
      sequence: 3,
      origin: { x: 0, y: 0 },
    })

    expect(nextNumberedMarkerSequence([one, three])).toBe(2)
  })

  it('copies portable layers, remaps IDs and demotes a copied base image', () => {
    const textLayer = createTextLayer({
      id: ids[0],
      text: 'placeholder',
      origin: { x: 0, y: 0 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
    })
    if (textLayer === null) throw new Error('expected non-empty text layer')
    const base: LayerNode = {
      ...textLayer,
      kind: 'image',
      locked: true,
      payload: {
        blobHash: 'a'.repeat(64),
        intrinsicWidth: 100,
        intrinsicHeight: 100,
        format: 'png',
        orientationApplied: true,
        color: { colorSpace: 'srgb', hasIccProfile: false },
        role: 'base',
        border: null,
        radius: 0,
        crop: null,
        mask: null,
      },
    }
    const encoded = encodeClipboardLayersV1([base])
    const decoded = decodeClipboardLayersV1(encoded)
    const pasted = pasteClipboardLayers(decoded, {
      id: () => ids[2],
      zoom: 2,
      cascadeIndex: 1,
    })

    expect(pasted[0]).toMatchObject({
      id: ids[2],
      locked: false,
      payload: { role: 'content' },
      transform: { translateX: 8, translateY: 8 },
    })
  })

  it('does not allocate content commands for an empty new text layer', () => {
    expect(
      createTextLayer({
        id: ids[0],
        text: '',
        origin: { x: 0, y: 0 },
        font: {
          source: 'bundled',
          family: 'Roboto',
          weight: 400,
          style: 'normal',
        },
      }),
    ).toBeNull()
    expect(document.schemaVersion).toBe(4)
  })

  it('commits text as exactly one add, update or removal command', () => {
    const created = createTextLayer({
      id: ids[0],
      text: 'initial',
      origin: { x: 0, y: 0 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
    })
    if (created === null) throw new Error('expected text layer')
    const updated = createTextLayer({
      id: ids[0],
      text: 'changed',
      origin: { x: 0, y: 0 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
    })
    if (updated === null) throw new Error('expected updated text layer')

    expect(createTextCommitCommand({ next: created })).toMatchObject({
      type: 'addLayer',
    })
    expect(
      createTextCommitCommand({ existing: created, next: updated }),
    ).toMatchObject({ type: 'updateLayer' })
    expect(
      createTextCommitCommand({ existing: created, next: null, index: 0 }),
    ).toMatchObject({ type: 'removeLayer', index: 0 })
  })

  it('creates one duplicate command with the shared screen-space offset', () => {
    const source = createTextLayer({
      id: ids[0],
      text: 'duplicate me',
      origin: { x: 0, y: 0 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
    })
    if (source === null) throw new Error('expected text layer')
    const command: EditorCommand = createDuplicateLayerCommand(source, {
      id: ids[1],
      zoom: 2,
      cascadeIndex: 1,
    })
    expect(command).toMatchObject({
      type: 'duplicateLayer',
      sourceId: ids[0],
      layer: { id: ids[1], transform: { translateX: 8, translateY: 8 } },
    })
  })
})
