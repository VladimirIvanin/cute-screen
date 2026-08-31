import { defaultCalloutRoute, rebaseCalloutLayer } from '../../callout-geometry'
import type {
  CalloutLayer,
  Point,
  SrgbColor,
  StrokeStyle,
  TextBackground,
} from '../../document/types'
import {
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_TEXT_FONT_SIZE,
  IDENTITY,
  assertFinitePoint,
  solidColor,
} from './shared'

const DEFAULT_CALLOUT_STROKE: StrokeStyle = Object.freeze({
  color: Object.freeze({ red: 0.55, green: 0.55, blue: 0.55, alpha: 1 }),
  width: 2,
  style: 'solid',
  cap: 'round',
  join: 'round',
})

/** Creates one portable leader-line callout; the direct editor owns later text edits. */
export function createCalloutLayer(input: {
  readonly id: string
  readonly text: string
  readonly target: Point
  readonly label: Point
  readonly fontFamily?: string
  readonly color?: SrgbColor
  readonly background?: TextBackground | null
  readonly stroke?: StrokeStyle
  readonly route?: CalloutLayer['payload']['route']
}): CalloutLayer | null {
  if (input.text.length === 0) return null
  assertFinitePoint(input.target)
  assertFinitePoint(input.label)
  const fontFamily = input.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY
  if (fontFamily.length === 0)
    throw new Error('callout font family is required')
  const fontSize = DEFAULT_TEXT_FONT_SIZE
  const stroke = input.stroke ?? DEFAULT_CALLOUT_STROKE
  const route = input.route ?? defaultCalloutRoute(input.target, input.label)
  const content = {
    text: input.text,
    wrap: 'autoSize' as const,
    spans: [
      {
        start: 0,
        end: input.text.length,
        fontFamily,
        fontSize,
        color: solidColor(input.color),
        weight: 400 as const,
        italic: false,
        strikethrough: false,
      },
    ],
    paragraphs: [
      {
        start: 0,
        end: input.text.length,
        alignment: 'start' as const,
        listKind: 'none' as const,
      },
    ],
  }
  const payload = Object.freeze({
    content,
    background: input.background ?? null,
    target: { x: input.target.x, y: input.target.y },
    label: { x: input.label.x, y: input.label.y },
    route,
    stroke,
    targetMarker: 'circle' as const,
    labelMarker: 'circle' as const,
  })
  const seed: CalloutLayer = Object.freeze({
    id: input.id,
    kind: 'callout',
    transform: IDENTITY,
    localBounds: { x: 0, y: 0, width: 1, height: 1 },
    visible: true,
    locked: false,
    payload,
  })
  return rebaseCalloutLayer(seed, payload)
}

/** Emoji stays portable by storing its grapheme and an approved static asset ID. */
