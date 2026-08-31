import { describe, expect, it } from 'vitest'

import { createDocumentRenderScene } from './index'
import { documentFixture as document } from './test-kit'

describe('document render scene: rich text and callouts', () => {
  it('compiles v7 runs and paragraph metadata into a renderer-neutral node', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000009',
          kind: 'text',
          localBounds: { x: 0, y: 0, width: 120, height: 48 },
          transform: {
            ...document.layers[0]!.transform,
            translateX: 12,
            translateY: 18,
          },
          visible: true,
          locked: false,
          payload: {
            content: {
              text: 'Привет\nworld',
              wrap: 'fixedWidth',
              fixedWidth: 120,
              spans: [
                {
                  start: 0,
                  end: 12,
                  fontFamily: 'Cute Sans',
                  fontSize: 20,
                  color: { red: 0.2, green: 0.3, blue: 0.4, alpha: 1 },
                  weight: 600,
                  italic: true,
                  strikethrough: true,
                },
              ],
              paragraphs: [
                {
                  start: 0,
                  end: 12,
                  alignment: 'center',
                  listKind: 'bullet',
                },
              ],
            },
            background: null,
          },
        },
      ],
    })

    expect(scene.nodes).toEqual([
      expect.objectContaining({
        kind: 'text',
        text: 'Привет\nworld',
        x: 12,
        y: 18,
        width: 120,
        wrap: 'fixedWidth',
        runs: [
          {
            start: 0,
            end: 12,
            fontFamily: 'Cute Sans',
            fontSize: 20,
            color: { red: 0.2, green: 0.3, blue: 0.4, alpha: 1 },
            fontWeight: 600,
            fontStyle: 'italic',
            strikethrough: true,
          },
        ],
        paragraphs: [
          {
            start: 0,
            end: 12,
            alignment: 'center',
            listKind: 'bullet',
          },
        ],
        opacity: 1,
        blendMode: 'normal',
      }),
    ])
  })

  it('renders a text background through the shared rectangle paint primitive', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000019',
          kind: 'text',
          localBounds: { x: 0, y: 0, width: 120, height: 24 },
          transform: {
            ...document.layers[0]!.transform,
            translateX: 20,
            translateY: 30,
          },
          visible: true,
          locked: false,
          payload: {
            content: {
              text: 'Label',
              wrap: 'autoSize',
              spans: [
                {
                  start: 0,
                  end: 5,
                  fontFamily: 'Roboto',
                  fontSize: 24,
                  color: { red: 0, green: 0, blue: 0, alpha: 1 },
                  weight: 400,
                  italic: false,
                  strikethrough: false,
                },
              ],
              paragraphs: [
                {
                  start: 0,
                  end: 5,
                  alignment: 'start',
                  listKind: 'none',
                },
              ],
            },
            background: {
              color: { red: 1, green: 0.8, blue: 0.2, alpha: 1 },
              padding: 6,
              radius: 4,
            },
          },
        },
      ],
    })

    expect(scene.nodes).toEqual([
      expect.objectContaining({
        kind: 'rect',
        id: '019c1f62-058e-7000-8000-000000000019:background',
        x: 14,
        y: 24,
        width: 132,
        height: 36,
        cornerRadius: 4,
      }),
      expect.objectContaining({
        kind: 'text',
        id: '019c1f62-058e-7000-8000-000000000019',
      }),
    ])
  })

  it('compiles a numbered marker body and readable label from its stable sequence', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000010',
          kind: 'numberedMarker',
          localBounds: { x: 0, y: 0, width: 32, height: 32 },
          transform: { ...document.layers[0]!.transform },
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
                  fontSize: 16,
                  color: { red: 1, green: 1, blue: 1, alpha: 1 },
                  weight: 700,
                  italic: false,
                  strikethrough: false,
                },
              ],
              paragraphs: [
                {
                  start: 0,
                  end: 1,
                  alignment: 'center',
                  listKind: 'none',
                },
              ],
            },
            badge: {
              shape: 'diamond',
              color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 },
            },
          },
        },
      ],
    })

    expect(scene.nodes).toEqual([
      expect.objectContaining({
        kind: 'polygon',
        id: expect.stringMatching(/:body$/u),
      }),
      expect.objectContaining({
        kind: 'text',
        id: expect.stringMatching(/:label$/u),
        text: '7',
        x: 12,
        y: 16,
        width: 32,
        height: 32,
        runs: [expect.objectContaining({ fontFamily: 'Roboto' })],
        paragraphs: [expect.objectContaining({ alignment: 'center' })],
        verticalAlign: 'visualCenter',
      }),
    ])
  })

  it('keeps callout connector, markers and multiline text in one ordered scene object', () => {
    const scene = createDocumentRenderScene({
      ...document,
      schemaVersion: 7,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-000000000011',
          kind: 'callout',
          localBounds: { x: 0, y: 0, width: 180, height: 120 },
          transform: { ...document.layers[0]!.transform },
          visible: true,
          locked: false,
          payload: {
            content: {
              text: 'Line one\nLine two',
              wrap: 'autoSize',
              spans: [
                {
                  start: 0,
                  end: 17,
                  fontFamily: 'Roboto',
                  fontSize: 24,
                  color: { red: 0, green: 0, blue: 0, alpha: 1 },
                  weight: 400,
                  italic: false,
                  strikethrough: false,
                },
              ],
              paragraphs: [
                {
                  start: 0,
                  end: 17,
                  alignment: 'start',
                  listKind: 'none',
                },
              ],
            },
            background: null,
            target: { x: 20, y: 90 },
            label: { x: 120, y: 40 },
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
      ],
    })

    expect(scene.nodes.map((node) => node.kind)).toEqual([
      'path',
      'ellipse',
      'ellipse',
      'text',
    ])
    expect(scene.nodes[0]).toMatchObject({
      id: expect.stringMatching(/:connector$/u),
    })
    expect(scene.nodes[3]).toMatchObject({
      text: 'Line one\nLine two',
      runs: [expect.objectContaining({ fontFamily: 'Roboto', fontSize: 24 })],
      paragraphs: [
        expect.objectContaining({ alignment: 'start', listKind: 'none' }),
      ],
    })
  })
})
