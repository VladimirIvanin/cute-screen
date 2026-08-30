import { readFileSync } from 'node:fs'

import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  CLIPBOARD_LAYERS_MIME,
  decodeClipboardLayersV2,
  encodeClipboardLayersV2,
} from '../tools/content/clipboard-codec'
import { parseEditorDocument, serializeEditorDocument } from './codec'
import { createEditorDocumentFromImage } from './factory'
import type {
  LayerNode,
  RichTextParagraph,
  RichTextSpan,
  TextLayer,
  TextLayerPayload,
} from './types'

const source = {
  blobHash: 'a'.repeat(64),
  format: 'png' as const,
  mimeType: 'image/png',
  width: 100,
  height: 80,
  orientationApplied: true as const,
  provenance: 'capture' as const,
  color: { colorSpace: 'srgb' as const, hasIccProfile: false },
}

const span = {
  start: 0,
  end: 4,
  fontFamily: 'Roboto',
  fontSize: 24,
  color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 },
  weight: 700,
  italic: true,
  strikethrough: true,
}

const content = {
  text: 'A😀B',
  wrap: 'autoSize',
  spans: [span],
  paragraphs: [{ start: 0, end: 4, alignment: 'center', listKind: 'bullet' }],
}

function textLayer() {
  return {
    id: '019c1f62-058e-7000-8000-000000000001',
    kind: 'text',
    transform: {
      translateX: 8,
      translateY: 12,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    localBounds: { x: 0, y: 0, width: 80, height: 40 },
    visible: true,
    locked: false,
    payload: {
      content,
      background: {
        color: { red: 1, green: 0.9, blue: 0.5, alpha: 1 },
        padding: 6,
        radius: 4,
      },
    },
  }
}

function documentWith(layers: readonly unknown[]) {
  return {
    schemaVersion: 7,
    id: '019c1f62-058e-7000-8000-000000000000',
    source: structuredClone(source),
    canvas: { width: 100, height: 80 },
    crop: null,
    layers,
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  }
}

describe('document schema v7 contract', () => {
  it('removes legacy text fields from the public TypeScript contract', () => {
    expectTypeOf<
      Extract<
        keyof RichTextSpan,
        'font' | 'underline' | 'letterSpacing' | 'opacity'
      >
    >().toEqualTypeOf<never>()
    expectTypeOf<
      Extract<keyof RichTextParagraph, 'justify' | 'lineHeight'>
    >().toEqualTypeOf<never>()
    expectTypeOf<RichTextParagraph['alignment']>().toEqualTypeOf<
      'start' | 'center' | 'end'
    >()
    expectTypeOf<RichTextParagraph['listKind']>().toEqualTypeOf<
      'none' | 'bullet'
    >()
    expectTypeOf<
      Extract<keyof TextLayerPayload, 'font' | 'fill' | 'outline' | 'presetId'>
    >().toEqualTypeOf<never>()
    expectTypeOf<
      Extract<keyof TextLayer, 'opacity' | 'blendMode' | 'shadows'>
    >().toEqualTypeOf<never>()
  })

  it('round-trips strict UTF-16 rich text and each text-bearing container', () => {
    const text = textLayer()
    const callout = {
      ...text,
      id: '019c1f62-058e-7000-8000-000000000002',
      kind: 'callout',
      payload: {
        content,
        background: null,
        target: { x: 20, y: 40 },
        label: { x: 120, y: 80 },
        route: {
          path: 'elbow',
          elbow: { axis: 'y', offset: 0 },
        },
        stroke: {
          color: { red: 0.5, green: 0.5, blue: 0.5, alpha: 1 },
          width: 2,
          style: 'solid',
          cap: 'round',
          join: 'round',
        },
        targetMarker: 'circle',
        labelMarker: 'circle',
      },
    }
    const marker = {
      ...text,
      id: '019c1f62-058e-7000-8000-000000000003',
      kind: 'numberedMarker',
      payload: {
        sequence: 1,
        label: content,
        badge: {
          shape: 'circle',
          color: { red: 0, green: 0, blue: 0, alpha: 1 },
        },
      },
    }

    const parsed = parseEditorDocument(documentWith([text, callout, marker]))
    expect(parsed).toMatchObject({ kind: 'editable' })
    if (parsed.kind !== 'editable') throw new Error('expected editable v7')
    expect(parsed.document.layers).toHaveLength(3)
    expect(
      parseEditorDocument(serializeEditorDocument(parsed.document)),
    ).toEqual(parsed)
  })

  it('rejects surrogate-splitting ranges and out-of-bounds text values', () => {
    const split = structuredClone(textLayer())
    split.payload.content.spans[0]!.end = 2
    expect(() => parseEditorDocument(documentWith([split]))).toThrow(/UTF-16/u)

    const oversized = structuredClone(textLayer())
    oversized.payload.content.spans[0]!.fontSize = 513
    expect(() => parseEditorDocument(documentWith([oversized]))).toThrow(
      /fontSize/u,
    )

    const padded = structuredClone(textLayer())
    padded.payload.background.padding = 257
    expect(() => parseEditorDocument(documentWith([padded]))).toThrow(
      /padding/u,
    )
  })

  it.each([
    ['common opacity', (layer: object) => Reflect.set(layer, 'opacity', 0.5)],
    [
      'common blend',
      (layer: object) => Reflect.set(layer, 'blendMode', 'screen'),
    ],
    ['common shadows', (layer: object) => Reflect.set(layer, 'shadows', [])],
    [
      'legacy text fill',
      (layer: ReturnType<typeof textLayer>) =>
        Reflect.set(layer.payload, 'fill', { kind: 'none' }),
    ],
    [
      'legacy preset',
      (layer: ReturnType<typeof textLayer>) =>
        Reflect.set(layer.payload, 'presetId', 'title'),
    ],
    [
      'legacy outline',
      (layer: ReturnType<typeof textLayer>) =>
        Reflect.set(layer.payload, 'outline', null),
    ],
    [
      'legacy layer font',
      (layer: ReturnType<typeof textLayer>) =>
        Reflect.set(layer.payload, 'font', {}),
    ],
    [
      'legacy background fill',
      (layer: ReturnType<typeof textLayer>) =>
        Reflect.set(layer.payload, 'background', {
          fill: { kind: 'solid', color: layer.payload.background.color },
          padding: 6,
          radius: 4,
        }),
    ],
    [
      'underline',
      (layer: ReturnType<typeof textLayer>) =>
        Reflect.set(layer.payload.content.spans[0]!, 'underline', true),
    ],
    [
      'letter spacing',
      (layer: ReturnType<typeof textLayer>) =>
        Reflect.set(layer.payload.content.spans[0]!, 'letterSpacing', 2),
    ],
    [
      'line height',
      (layer: ReturnType<typeof textLayer>) =>
        Reflect.set(layer.payload.content.paragraphs[0]!, 'lineHeight', 1.5),
    ],
  ])('rejects removed v7 field: %s', (_name, mutate) => {
    const candidate = structuredClone(textLayer())
    mutate(candidate)
    expect(() => parseEditorDocument(documentWith([candidate]))).toThrow(
      /removed|unsupported|unexpected/u,
    )
  })

  it('rejects legacy callout bubble/tail payload fields', () => {
    const legacy = {
      ...textLayer(),
      kind: 'callout',
      payload: {
        content,
        bubble: {
          color: { red: 1, green: 1, blue: 1, alpha: 1 },
          padding: 8,
          radius: 8,
        },
        tailAnchor: { x: 90, y: 70 },
      },
    }
    expect(() => parseEditorDocument(documentWith([legacy]))).toThrow(
      /legacy callout bubble\/tail fields are removed/u,
    )
  })

  it.each([
    [
      'callout',
      {
        content,
        background: null,
        target: { x: 20, y: 40 },
        label: { x: 120, y: 80 },
        route: {
          path: 'elbow',
          elbow: { axis: 'y', offset: 0 },
        },
        stroke: {
          color: { red: 0.5, green: 0.5, blue: 0.5, alpha: 1 },
          width: 2,
          style: 'solid',
          cap: 'round',
          join: 'round',
        },
        targetMarker: 'circle',
        labelMarker: 'circle',
      },
    ],
    [
      'numberedMarker',
      {
        sequence: 1,
        label: content,
        badge: {
          shape: 'circle',
          color: { red: 0, green: 0, blue: 0, alpha: 1 },
        },
      },
    ],
  ])('rejects common effects on the %s text-bearing layer', (kind, payload) => {
    const candidate = { ...textLayer(), kind, payload, opacity: 1 }
    expect(() => parseEditorDocument(documentWith([candidate]))).toThrow(
      /text-bearing common effects are removed/u,
    )
  })

  it('returns typed older and newer schema states without mutating raw data', () => {
    for (let schemaVersion = 0; schemaVersion <= 6; schemaVersion += 1) {
      const raw = { schemaVersion, nested: { retained: true } }
      const snapshot = structuredClone(raw)
      expect(parseEditorDocument(raw)).toEqual({
        kind: 'unsupported',
        schemaVersion,
        raw,
        reason: 'olderSchema',
      })
      expect(raw).toEqual(snapshot)
      expect(Object.isFrozen(raw)).toBe(false)
    }
    expect(parseEditorDocument({ schemaVersion: 8, marker: 'future' })).toEqual(
      {
        kind: 'readOnly',
        schemaVersion: 8,
        raw: { schemaVersion: 8, marker: 'future' },
        reason: 'newerSchema',
      },
    )
  })

  it('creates a v7 image document that reopens through the production parser', () => {
    const created = createEditorDocumentFromImage({
      id: '019c1f62-058e-7000-8000-000000000000',
      baseLayerId: '019c1f62-058e-7000-8000-000000000004',
      source,
      timestamp: '2026-08-14T00:00:00.000Z',
    })
    expect(created.schemaVersion).toBe(7)
    expect(parseEditorDocument(serializeEditorDocument(created))).toEqual({
      kind: 'editable',
      document: created,
    })
    expect(serializeEditorDocument(created)).not.toMatch(/base64|data:/iu)
  })

  it('opens the exact native Rust v7 factory fixture', () => {
    const nativeDocument = readFileSync(
      new URL('./fixtures/native-v7-document.json', import.meta.url),
      'utf8',
    )
    const parsed = parseEditorDocument(nativeDocument)
    expect(parsed).toMatchObject({ kind: 'editable' })
    expect(nativeDocument).not.toMatch(/base64|data:/iu)
  })

  it('rejects inline image bytes at both source and layer boundaries', () => {
    const inlineSource = documentWith([])
    Reflect.set(inlineSource.source, 'dataUrl', 'data:image/png;base64,AA==')
    expect(() => parseEditorDocument(inlineSource)).toThrow(
      /immutable image bytes by hash/u,
    )

    const created = createEditorDocumentFromImage({
      id: '019c1f62-058e-7000-8000-000000000000',
      baseLayerId: '019c1f62-058e-7000-8000-000000000004',
      source,
      timestamp: '2026-08-14T00:00:00.000Z',
    })
    const inlineLayer = structuredClone(created)
    const base = inlineLayer.layers[0]
    if (!base || base.kind !== 'image') throw new Error('expected image layer')
    Reflect.set(base.payload, 'base64', 'AA==')
    expect(() => parseEditorDocument(inlineLayer)).toThrow(
      /immutable image bytes by hash/u,
    )
  })

  it('round-trips v7 text-bearing layers through clipboard v2', () => {
    expect(CLIPBOARD_LAYERS_MIME).toBe(
      'application/x-cute-screen-layers+json;version=2',
    )
    const encoded = encodeClipboardLayersV2([
      textLayer() as unknown as LayerNode,
    ])
    expect(JSON.parse(encoded)).toMatchObject({
      version: 2,
      documentSchemaVersion: 7,
    })
    expect(decodeClipboardLayersV2(encoded).layers).toEqual([textLayer()])
    expect(() =>
      decodeClipboardLayersV2(
        JSON.stringify({ version: 1, documentSchemaVersion: 6, layers: [] }),
      ),
    ).toThrow(/unsupported version/u)
  })
})
