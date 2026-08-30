import type { Point, SrgbColor, TextLayer } from '../../document/types'
import {
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_LINE_HEIGHT,
  IDENTITY,
  assertFinitePoint,
  assertTextBackground,
  solidColor,
} from './shared'

/**
 * Builds an uncommitted layer. The session controller decides whether it becomes
 * one addLayer or updateLayer command; a blank new session intentionally yields
 * no command.
 */
export function createTextLayer(input: {
  readonly id: string
  readonly text: string
  readonly origin: Point
  readonly fontFamily?: string
  readonly fontSize?: number
  readonly weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
  readonly italic?: boolean
  readonly strikethrough?: boolean
  readonly alignment?: 'start' | 'center' | 'end'
  readonly listKind?: 'none' | 'bullet'
  readonly fixedWidth?: number
  readonly color?: SrgbColor
  readonly background?: TextLayer['payload']['background']
}): TextLayer | null {
  if (input.text.length === 0) return null
  assertFinitePoint(input.origin)
  if (
    input.fixedWidth !== undefined &&
    (!Number.isFinite(input.fixedWidth) || input.fixedWidth <= 0)
  ) {
    throw new Error('fixed-width text requires a positive finite width')
  }
  const fontFamily = input.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY
  if (fontFamily.length === 0) throw new Error('text font family is required')
  const fontSize = input.fontSize ?? DEFAULT_TEXT_FONT_SIZE
  if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 256) {
    throw new Error('text font size must be between 8 and 256')
  }
  const weight = input.weight ?? 400
  if (
    !Number.isInteger(weight) ||
    weight < 100 ||
    weight > 900 ||
    weight % 100 !== 0
  ) {
    throw new Error('text weight must be a portable CSS weight')
  }
  if (input.background) assertTextBackground(input.background)
  const width =
    input.fixedWidth ?? Math.max(fontSize, input.text.length * fontSize * 0.6)
  return Object.freeze({
    id: input.id,
    kind: 'text',
    transform: {
      ...IDENTITY,
      translateX: input.origin.x,
      translateY: input.origin.y,
    },
    localBounds: {
      x: 0,
      y: 0,
      width,
      height: Math.max(
        fontSize * DEFAULT_TEXT_LINE_HEIGHT,
        input.text.split('\n').length * fontSize * DEFAULT_TEXT_LINE_HEIGHT,
      ),
    },
    visible: true,
    locked: false,
    payload: {
      content: {
        text: input.text,
        wrap: (input.fixedWidth === undefined ? 'autoSize' : 'fixedWidth') as
          'autoSize' | 'fixedWidth',
        ...(input.fixedWidth === undefined
          ? {}
          : { fixedWidth: input.fixedWidth }),
        spans: [
          {
            start: 0,
            end: input.text.length,
            fontFamily,
            fontSize,
            color: solidColor(input.color),
            weight,
            italic: input.italic ?? false,
            strikethrough: input.strikethrough ?? false,
          },
        ],
        paragraphs: [
          {
            start: 0,
            end: input.text.length,
            alignment: input.alignment ?? 'start',
            listKind: input.listKind ?? 'none',
          },
        ],
      },
      background:
        input.background == null
          ? null
          : {
              color: solidColor(
                input.background.color,
                'text background color',
              ),
              padding: input.background.padding,
              radius: input.background.radius,
            },
    },
  })
}
