import type { RenderTextNode, RenderTextStyle } from '@cute-screen/editor-core'
import { describe, expect, it } from 'vitest'

import { layoutRichText } from './rich-text-layout'

const black = { red: 0, green: 0, blue: 0, alpha: 1 } as const
const red = { red: 1, green: 0, blue: 0, alpha: 1 } as const

function textNode(overrides: Partial<RenderTextNode> = {}): RenderTextNode {
  return {
    id: 'rich-text',
    kind: 'text',
    text: 'A😀 B',
    x: 10,
    y: 20,
    width: 20,
    height: 80,
    wrap: 'fixedWidth',
    runs: [
      {
        start: 0,
        end: 3,
        fontFamily: 'Roboto',
        fontSize: 10,
        color: black,
        fontWeight: 400,
        fontStyle: 'normal',
        strikethrough: false,
      },
      {
        start: 3,
        end: 5,
        fontFamily: 'Serif',
        fontSize: 20,
        color: red,
        fontWeight: 700,
        fontStyle: 'italic',
        strikethrough: true,
      },
    ],
    paragraphs: [{ start: 0, end: 5, alignment: 'start', listKind: 'none' }],
    rotation: 0,
    opacity: 1,
    visible: true,
    ...overrides,
  }
}

const measure = (text: string, style: RenderTextStyle): number =>
  Array.from(text).length * (style.fontSize / 2)

describe('renderer-neutral rich text layout', () => {
  it('traverses UTF-16 ranges without splitting surrogate pairs and wraps mixed runs', () => {
    const node = textNode()
    const layout = layoutRichText(node, measure)

    expect(node.text).toBe('A😀 B')
    expect(layout.lines).toHaveLength(2)
    expect(layout.lines[0]?.fragments).toEqual([
      expect.objectContaining({ text: 'A😀', start: 0, end: 3 }),
    ])
    expect(layout.lines[1]?.fragments).toEqual([
      expect.objectContaining({
        text: 'B',
        start: 4,
        end: 5,
        fontFamily: 'Serif',
        fontSize: 20,
        fontWeight: 700,
        fontStyle: 'italic',
        color: red,
      }),
    ])
    expect(layout.lines[1]?.strikes).toEqual([
      expect.objectContaining({ width: 10, color: red }),
    ])
  })

  it('uses paragraph metadata for bullets and alignment without inserting content characters', () => {
    const text = 'one\ntwo'
    const node = textNode({
      text,
      width: 100,
      runs: [
        {
          start: 0,
          end: text.length,
          fontFamily: 'Roboto',
          fontSize: 20,
          color: black,
          fontWeight: 400,
          fontStyle: 'normal',
          strikethrough: false,
        },
      ],
      paragraphs: [
        { start: 0, end: 4, alignment: 'start', listKind: 'bullet' },
        { start: 4, end: 7, alignment: 'end', listKind: 'none' },
      ],
    })

    const layout = layoutRichText(node, measure)

    expect(node.text).toBe('one\ntwo')
    expect(layout.lines.map((line) => line.text)).toEqual(['one', 'two'])
    expect(layout.lines[0]?.bullet).toEqual(
      expect.objectContaining({ color: black }),
    )
    expect(layout.lines[0]?.fragments[0]?.x).toBeGreaterThan(node.x)
    expect(layout.lines[1]?.bullet).toBeUndefined()
    expect(layout.lines[1]?.x).toBe(node.x + node.width - 30)
  })

  it('centers compact labels as a complete mixed-run block', () => {
    const layout = layoutRichText(
      textNode({
        text: '12',
        width: 60,
        height: 60,
        verticalAlign: 'visualCenter',
        runs: [
          {
            start: 0,
            end: 1,
            fontFamily: 'Roboto',
            fontSize: 16,
            color: black,
            fontWeight: 700,
            fontStyle: 'normal',
            strikethrough: false,
          },
          {
            start: 1,
            end: 2,
            fontFamily: 'Roboto',
            fontSize: 24,
            color: red,
            fontWeight: 700,
            fontStyle: 'italic',
            strikethrough: false,
          },
        ],
        paragraphs: [
          { start: 0, end: 2, alignment: 'center', listKind: 'none' },
        ],
      }),
      measure,
    )

    expect(layout.lines).toHaveLength(1)
    expect(layout.lines[0]?.height).toBe(30)
    expect(layout.lines[0]?.top).toBe(35)
    expect(layout.lines[0]?.baseline).toBeCloseTo(57.2)
    expect(
      layout.lines[0]?.fragments.map((fragment) => fragment.fontSize),
    ).toEqual([16, 24])
  })

  it('keeps a CSS-like line baseline stable when glyph ink bounds change', () => {
    const node = textNode({
      text: 'a',
      width: 100,
      runs: [
        {
          start: 0,
          end: 1,
          fontFamily: 'Roboto',
          fontSize: 20,
          color: black,
          fontWeight: 400,
          fontStyle: 'normal',
          strikethrough: false,
        },
      ],
      paragraphs: [{ start: 0, end: 1, alignment: 'start', listKind: 'none' }],
    })
    const shallowInk = layoutRichText(node, () => ({
      width: 10,
      ascent: 10,
      descent: 2,
    }))
    const tallInk = layoutRichText(node, () => ({
      width: 10,
      ascent: 18,
      descent: 3,
    }))

    expect(shallowInk.lines[0]?.baseline).toBe(tallInk.lines[0]?.baseline)
    expect(shallowInk.lines[0]?.baseline).toBe(38.5)
  })
})
