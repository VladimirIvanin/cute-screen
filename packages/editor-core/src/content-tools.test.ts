import { describe, expect, it } from 'vitest'

import {
  createCalloutLayer,
  createContentImageLayer,
  createDuplicateLayerCommand,
  createEmojiLayer,
  createNumberedMarkerLayer,
  createTextCommitCommand,
  createTextLayer,
  decodeClipboardLayersV2,
  encodeClipboardLayersV2,
  nextNumberedMarkerSequence,
  pasteClipboardLayers,
  routeClipboardSnapshot,
  type EditorCommand,
} from './index'

const ids = [
  '019c1f62-058e-7000-8000-000000000001',
  '019c1f62-058e-7000-8000-000000000002',
  '019c1f62-058e-7000-8000-000000000003',
] as const

describe('v7 content-layer core contracts', () => {
  it('creates 24 px portable text with only the approved span fields', () => {
    const layer = createTextLayer({
      id: ids[0],
      text: 'Привет\nworld',
      origin: { x: 8, y: 12 },
      weight: 700,
      italic: true,
      strikethrough: true,
      alignment: 'center',
      listKind: 'bullet',
      color: { red: 0.9, green: 0.28, blue: 0.3, alpha: 1 },
    })
    if (layer === null) throw new Error('expected non-empty text layer')

    expect(layer).not.toHaveProperty('opacity')
    expect(layer).not.toHaveProperty('blendMode')
    expect(layer).not.toHaveProperty('shadows')
    expect(layer.payload.content.spans).toEqual([
      {
        start: 0,
        end: 12,
        fontFamily: 'Roboto',
        fontSize: 24,
        color: { red: 0.9, green: 0.28, blue: 0.3, alpha: 1 },
        weight: 700,
        italic: true,
        strikethrough: true,
      },
    ])
    expect(layer.payload.content.paragraphs).toEqual([
      {
        start: 0,
        end: 12,
        alignment: 'center',
        listKind: 'bullet',
      },
    ])
  })

  it('persists only a bounded solid text background', () => {
    const background = {
      color: { red: 1, green: 0.8, blue: 0.2, alpha: 1 },
      padding: 6,
      radius: 4,
    }
    const layer = createTextLayer({
      id: ids[0],
      text: 'label',
      origin: { x: 8, y: 12 },
      background,
    })
    expect(layer?.payload.background).toEqual(background)
    expect(() =>
      createTextLayer({
        id: ids[0],
        text: 'invalid',
        origin: { x: 8, y: 12 },
        background: { ...background, padding: 257 },
      }),
    ).toThrow(/padding/u)
  })

  it('allocates the minimal free marker number and preserves badge semantics', () => {
    const one = createNumberedMarkerLayer({
      id: ids[0],
      sequence: 1,
      origin: { x: 0, y: 0 },
    })
    const three = createNumberedMarkerLayer({
      id: ids[1],
      sequence: 3,
      origin: { x: 0, y: 0 },
      shape: 'diamond',
    })
    expect(nextNumberedMarkerSequence([one, three])).toBe(2)
    expect(three.payload.badge.shape).toBe('diamond')
    expect(three).not.toHaveProperty('opacity')
  })

  it('copies v7 portable layers, remaps IDs and demotes a base image', () => {
    const base = createContentImageLayer({
      id: ids[0],
      blobHash: 'a'.repeat(64),
      format: 'png',
      intrinsicWidth: 100,
      intrinsicHeight: 100,
      origin: { x: 0, y: 0 },
    })
    const encoded = encodeClipboardLayersV2([
      { ...base, locked: true, payload: { ...base.payload, role: 'base' } },
    ])
    const decoded = decodeClipboardLayersV2(encoded)
    const pasted = pasteClipboardLayers(decoded, {
      id: () => ids[2],
      zoom: 2,
      cascadeIndex: 1,
    })

    expect(JSON.parse(encoded)).toMatchObject({
      version: 2,
      documentSchemaVersion: 7,
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
      createTextLayer({ id: ids[0], text: '', origin: { x: 0, y: 0 } }),
    ).toBeNull()
  })

  it('commits text as exactly one add, update or removal command', () => {
    const created = createTextLayer({
      id: ids[0],
      text: 'initial',
      origin: { x: 0, y: 0 },
    })
    const updated = createTextLayer({
      id: ids[0],
      text: 'changed',
      origin: { x: 0, y: 0 },
    })
    if (created === null || updated === null) throw new Error('expected text')
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
    })
    if (source === null) throw new Error('expected text')
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

  it('creates callout, emoji and immutable content-image layers', () => {
    const callout = createCalloutLayer({
      id: ids[0],
      text: 'Read this',
      origin: { x: 10, y: 12 },
      tailAnchor: { x: 80, y: 90 },
    })
    expect(callout).toMatchObject({
      kind: 'callout',
      payload: {
        content: { text: 'Read this' },
        bubble: { padding: 8, radius: 8 },
        tailAnchor: { x: 80, y: 90 },
      },
    })
    expect(callout).not.toHaveProperty('opacity')
    expect(
      createEmojiLayer({
        id: ids[1],
        grapheme: '👩🏽‍💻',
        origin: { x: 4, y: 6 },
        asset: {
          collection: 'notoEmoji',
          version: '15.1',
          assetId: 'woman-technologist',
        },
      }),
    ).toMatchObject({ kind: 'emoji', payload: { grapheme: '👩🏽‍💻' } })
    expect(
      createContentImageLayer({
        id: ids[2],
        blobHash: 'b'.repeat(64),
        format: 'webp',
        intrinsicWidth: 80,
        intrinsicHeight: 60,
        origin: { x: 15, y: 20 },
      }),
    ).toMatchObject({ kind: 'image', payload: { role: 'content' } })
  })

  it('sizes a multiline 24 px callout from its longest line', () => {
    const layer = createCalloutLayer({
      id: ids[0],
      text: 'wide line\nx',
      origin: { x: 10, y: 12 },
      tailAnchor: { x: 40, y: 80 },
    })
    expect(layer?.localBounds).toMatchObject({
      width: 24 * 'wide line'.length * 0.6 + 16,
      height: 24 * 1.25 * 2 + 16,
    })
  })

  it('routes clipboard content by active and empty-state precedence', () => {
    const internal = encodeClipboardLayersV2([
      createNumberedMarkerLayer({
        id: ids[0],
        sequence: 1,
        origin: { x: 0, y: 0 },
      }),
    ])
    expect(
      routeClipboardSnapshot({
        activeDocument: true,
        internal,
        bitmapAvailable: true,
        text: 'fallback',
      }),
    ).toMatchObject({ kind: 'internal' })
    expect(
      routeClipboardSnapshot({
        activeDocument: true,
        internal: '{bad json',
        bitmapAvailable: true,
      }),
    ).toMatchObject({ kind: 'bitmap', warning: 'internalPayloadInvalid' })
    expect(
      routeClipboardSnapshot({ activeDocument: true, text: 'plain text' }),
    ).toEqual({ kind: 'text', text: 'plain text' })
    expect(routeClipboardSnapshot({ activeDocument: false, internal })).toEqual(
      { kind: 'emptyHint' },
    )
  })
})
