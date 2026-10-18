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
  RichTextContent,
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
  assertFinitePoint(input.target)
  assertFinitePoint(input.label)
  const fontFamily = input.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY
  if (fontFamily.length === 0) throw new Error('callout font family is required')
  const stroke = input.stroke ?? DEFAULT_CALLOUT_STROKE
  const route = input.route ?? (input.style === null ? { path: 'elbow' as const, elbow: { axis: Math.abs(input.label.x - input.target.x) >= Math.abs(input.label.y - input.target.y) ? 'y' as const : 'x' as const, offset: 0 } } : defaultCalloutRoute(input.target, input.label))
  const style = input.style === null ? undefined : input.style ?? DEFAULT_CALLOUT_STYLE
  const content = calloutRichText(input.text, fontFamily, input.color)
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
      attachment: input.attachment ?? defaultCalloutAttachment(),
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

function calloutRichText(
  text: string,
  fontFamily: string,
  color: SrgbColor | undefined,
): RichTextContent {
  return {
    text, wrap: 'autoSize',
    spans: text.length === 0 ? [] : [{ start: 0, end: text.length, fontFamily, fontSize: DEFAULT_TEXT_FONT_SIZE,
      color: solidColor(color), weight: 400, italic: false, strikethrough: false }],
    paragraphs: text.length === 0 ? [] : [{ start: 0, end: text.length, alignment: 'start', listKind: 'none' }],
  }
}
