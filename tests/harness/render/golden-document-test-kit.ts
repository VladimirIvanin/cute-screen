import {
  createDocumentRenderScene,
  createRenderSceneSnapshot,
  parseEditorDocument,
  serializeEditorDocument,
  type ArrowLayer,
  type EditorDocumentV1,
  type RenderSceneSnapshot,
} from '@cute-screen/editor-core'

export function curvedStartCapRepairScene(): RenderSceneSnapshot {
  const arrow: ArrowLayer = {
    id: '019c1f62-058e-7000-8000-000000000613',
    kind: 'arrow',
    localBounds: { x: 0, y: 0, width: 360, height: 140 },
    transform: {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal',
    shadows: [],
    payload: {
      path: 'quadratic',
      start: { x: 32, y: 28 },
      end: { x: 328, y: 110 },
      bend: { x: 76, y: 102 },
      stroke: {
        color: { red: 1, green: 0.78, blue: 0.23, alpha: 1 },
        width: 6,
        style: 'solid',
        cap: 'round',
        join: 'round',
      },
      startCap: 'solidArrow',
      endCap: 'solidArrow',
    },
  }
  const document: EditorDocumentV1 = {
    schemaVersion: 7,
    id: '019c1f62-058e-7000-8000-000000000614',
    source: {
      blobHash: 'b'.repeat(64),
      format: 'png',
      mimeType: 'image/png',
      width: 360,
      height: 140,
      orientationApplied: true,
      provenance: 'capture',
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas: { width: 360, height: 140 },
    crop: null,
    layers: [arrow],
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  }
  const parsed = parseEditorDocument(serializeEditorDocument(document))
  if (parsed.kind !== 'editable')
    throw new Error('curved start-cap repair golden must be editable')
  const arrowScene = createDocumentRenderScene(parsed.document)
  return createRenderSceneSnapshot({
    width: arrowScene.width,
    height: arrowScene.height,
    nodes: [
      {
        kind: 'rect',
        id: 'repair-background',
        x: 0,
        y: 0,
        width: arrowScene.width,
        height: arrowScene.height,
        rotation: 0,
        opacity: 1,
        visible: true,
        fill: { red: 0.055, green: 0.063, blue: 0.075, alpha: 1 },
      },
      ...arrowScene.nodes,
    ],
  })
}

export function persistedRichTextScene(): RenderSceneSnapshot {
  const document: EditorDocumentV1 = {
    schemaVersion: 7,
    id: '019c1f62-058e-7000-8000-000000000700',
    source: {
      blobHash: 'c'.repeat(64),
      format: 'png',
      mimeType: 'image/png',
      width: 360,
      height: 220,
      orientationApplied: true,
      provenance: 'capture',
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas: { width: 360, height: 220 },
    crop: null,
    layers: [
      {
        id: '019c1f62-058e-7000-8000-000000000701',
        kind: 'text',
        localBounds: { x: 0, y: 0, width: 140, height: 92 },
        transform: {
          translateX: 20,
          translateY: 20,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        visible: true,
        locked: false,
        payload: {
          content: {
            text: 'Mix 😀 red wrapping words',
            wrap: 'fixedWidth',
            fixedWidth: 140,
            spans: [
              {
                start: 0,
                end: 6,
                fontFamily: 'Roboto',
                fontSize: 18,
                color: { red: 0.08, green: 0.16, blue: 0.3, alpha: 1 },
                weight: 400,
                italic: false,
                strikethrough: false,
              },
              {
                start: 6,
                end: 25,
                fontFamily: 'Roboto',
                fontSize: 26,
                color: { red: 0.88, green: 0.12, blue: 0.18, alpha: 1 },
                weight: 700,
                italic: true,
                strikethrough: true,
              },
            ],
            paragraphs: [
              { start: 0, end: 25, alignment: 'center', listKind: 'bullet' },
            ],
          },
          background: {
            color: { red: 1, green: 0.87, blue: 0.42, alpha: 1 },
            padding: 6,
            radius: 10,
          },
        },
      },
      {
        id: '019c1f62-058e-7000-8000-000000000702',
        kind: 'callout',
        localBounds: { x: 0, y: 0, width: 150, height: 80 },
        transform: {
          translateX: 190,
          translateY: 24,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        visible: true,
        locked: false,
        payload: {
          content: {
            text: 'Callout\nсправа',
            wrap: 'fixedWidth',
            fixedWidth: 134,
            spans: [
              {
                start: 0,
                end: 8,
                fontFamily: 'Roboto',
                fontSize: 20,
                color: { red: 1, green: 1, blue: 1, alpha: 1 },
                weight: 700,
                italic: false,
                strikethrough: false,
              },
              {
                start: 8,
                end: 14,
                fontFamily: 'Roboto',
                fontSize: 16,
                color: { red: 0.72, green: 0.9, blue: 1, alpha: 1 },
                weight: 400,
                italic: true,
                strikethrough: false,
              },
            ],
            paragraphs: [
              { start: 0, end: 8, alignment: 'start', listKind: 'none' },
              { start: 8, end: 14, alignment: 'end', listKind: 'bullet' },
            ],
          },
          background: null,
          target: { x: 40, y: 100 },
          label: { x: 160, y: 40 },
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
      },
      {
        id: '019c1f62-058e-7000-8000-000000000703',
        kind: 'numberedMarker',
        localBounds: { x: 0, y: 0, width: 52, height: 52 },
        transform: {
          translateX: 154,
          translateY: 150,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        visible: true,
        locked: false,
        payload: {
          sequence: 7,
          label: {
            text: '7',
            wrap: 'autoSize',
            spans: [
              {
                start: 0,
                end: 1,
                fontFamily: 'Roboto',
                fontSize: 28,
                color: { red: 1, green: 1, blue: 1, alpha: 1 },
                weight: 700,
                italic: false,
                strikethrough: true,
              },
            ],
            paragraphs: [
              { start: 0, end: 1, alignment: 'center', listKind: 'none' },
            ],
          },
          badge: {
            shape: 'circle',
            color: { red: 0.72, green: 0.16, blue: 0.42, alpha: 1 },
          },
        },
      },
    ],
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  }
  const parsed = parseEditorDocument(serializeEditorDocument(document))
  if (parsed.kind !== 'editable')
    throw new Error('rich-text golden must be editable')
  return createDocumentRenderScene(parsed.document)
}
