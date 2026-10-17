import {
  defaultCalloutRoute,
  rebaseCalloutLayer,
  defaultCalloutAttachment,
  DEFAULT_CALLOUT_STYLE,
} from '../../callout-geometry'
import type {
  CalloutLayer,
  Point,
  SrgbColor,
  StrokeStyle,
  TextBackground,
  CalloutStyle,
  CalloutAttachment,
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
  readonly style?: CalloutStyle | null
  readonly attachment?: CalloutAttachment
}): CalloutLayer | null {
  if (input.text.length === 0) return null
  assertFinitePoint(input.target)
  assertFinitePoint(input.label)
  const fontFamily = input.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY
  if (fontFamily.length === 0) throw new Error('callout font family is required')
  const fontSize = DEFAULT_TEXT_FONT_SIZE
  const stroke = input.stroke ?? DEFAULT_CALLOUT_STROKE
  const route = input.route ?? (input.style === null ? { path: 'elbow' as const, elbow: { axis: Math.abs(input.label.x - input.target.x) >= Math.abs(input.label.y - input.target.y) ? 'y' as const : 'x' as const, offset: 0 } } : defaultCalloutRoute(input.target, input.label))
  const style = input.style === null ? undefined : input.style ?? DEFAULT_CALLOUT_STYLE
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
    targetMarker: style?.targetMarker ?? 'circle',
    labelMarker: style?.labelMarker ?? 'circle',
    ...(style ? {
      frame: style.frame,
      attachment: input.attachment ?? defaultCalloutAttachment(input.target, input.label),
      ...(style.targetMarkerStyle ? { targetMarkerStyle: style.targetMarkerStyle } : {}),
      ...(style.labelMarkerStyle ? { labelMarkerStyle: style.labelMarkerStyle } : {}),
      route: input.route ?? (style.route === 'straight' ? { path: 'straight' as const }
        : style.route === 'elbow' ? { path: 'elbow' as const, elbow: { axis: 'y' as const, offset: 0 } } : route),
    } : {}),
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
