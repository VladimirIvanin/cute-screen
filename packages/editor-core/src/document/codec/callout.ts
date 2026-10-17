import type {
  CalloutPayload,
  CalloutRoute,
  CalloutFrame,
  CalloutMarker,
  CalloutMarkerStyle,
  CalloutAttachment,
  CalloutStyle,
  SrgbColor,
} from '../types'
import { readJsonObject } from '../json'
import {
  parsePointPayload,
  parseSrgbColor,
  parseStroke,
} from './paint'
import {
  assertOnlyFields,
  readFiniteNumber,
  parseBoundedNonNegative,
} from './primitives'
import {
  parseRichTextContent,
  parseTextBackground,
} from './text'

function axis(value: unknown): 'x' | 'y' {
  if (value !== 'x' && value !== 'y') throw new Error('invalid callout axis')
  return value
}
function parseRoute(
  value: unknown,
  field: string,
): CalloutRoute {
  const input = readJsonObject(value, field)
  if (input.path === 'straight') {
    assertOnlyFields(input, ['path'], field)
    return { path: 'straight' }
  }
  if (input.path === 'corner') {
    assertOnlyFields(input, ['path', 'axis'], field)
    return { path: 'corner', axis: axis(input.axis) }
  }
  if (input.path === 'orthogonal') {
    assertOnlyFields(input, ['path', 'points', 'preset', 'axis'], field)
    if (
      !Array.isArray(input.points) ||
      input.points.length > 128 ||
      !['corner', 'elbow'].includes(String(input.preset))
    ) throw new Error(`${field} invalid manual route`)
    return { path: 'orthogonal', points: input.points.map((p, i) => parsePointPayload(p,
      `${field}.points[${i}]`) as CalloutPayload['target']), preset: input.preset as 'corner' | 'elbow',
    axis: axis(input.axis) }
  }
  assertOnlyFields(input, ['path', 'elbow'], field)
  if (input.path !== 'elbow') throw new Error(`${field}.path is invalid`)
  const elbow = readJsonObject(input.elbow, `${field}.elbow`)
  assertOnlyFields(elbow, ['axis', 'offset'], `${field}.elbow`)
  return { path: 'elbow', elbow: { axis: axis(elbow.axis), offset: readFiniteNumber(elbow.offset,
    `${field}.elbow.offset`) } }
}
function marker(
  value: unknown,
  field: string,
): CalloutMarker {
  if (!['none', 'circle', 'ring', 'lineArrow',
    'solidArrow'].includes(String(value))) throw new Error(`${field} invalid marker`)
  return value as CalloutMarker
}
function markerStyle(
  value: unknown,
  field: string,
): CalloutMarkerStyle {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['size', 'color'], field)
  const size = input.size === undefined ? undefined : parseBoundedNonNegative(input.size, `${field}.size`, 128)
  if (size !== undefined && size < 2) throw new Error(`${field}.size must be at least 2`)
  return {
    ...(size === undefined ? {} : { size }),
    ...(input.color === undefined ? {} : { color: parseSrgbColor(input.color, `${field}.color`) as SrgbColor }),
  }
}
export function parseCalloutFrame(
  value: unknown,
  field: string,
): CalloutFrame {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['kind', 'fill', 'border', 'padding', 'radius'], field)
  if (!['text', 'outline', 'card', 'capsule',
    'accent'].includes(String(input.kind))) throw new Error(`${field}.kind invalid`)
  return {
    kind: input.kind as CalloutFrame['kind'], fill: parseSrgbColor(input.fill, `${field}.fill`) as SrgbColor,
    border: input.border === null ? null : parseStroke(input.border, `${field}.border`) as CalloutPayload['stroke'],
    padding: parseBoundedNonNegative(input.padding, `${field}.padding`, 256),
    radius: parseBoundedNonNegative(input.radius, `${field}.radius`, 256),
  }
}
export function parseCalloutPayload(
  value: unknown,
  field: string,
): CalloutPayload {
  const input = readJsonObject(value, field)
  if (Object.hasOwn(input, 'bubble') || Object.hasOwn(input,
    'tailAnchor')) throw new Error(`${field} legacy callout bubble/tail fields are removed in v7`)
  assertOnlyFields(input, ['content', 'background', 'target', 'label', 'route', 'stroke', 'targetMarker',
    'labelMarker', 'attachment', 'frame', 'targetMarkerStyle', 'labelMarkerStyle'], field)
  if (input.attachment !== undefined && !['left', 'right', 'top',
    'bottom'].includes(String(input.attachment))) throw new Error(`${field}.attachment invalid`)
  const target = parsePointPayload(input.target, `${field}.target`) as CalloutPayload['target']
  const label = parsePointPayload(input.label, `${field}.label`) as CalloutPayload['label']
  const route = parseRoute(input.route, `${field}.route`)
  if (route.path === 'orthogonal') {
    const points = [target, ...route.points, label]
    if (points.slice(1).some((p, i) => p.x !== points[i]!.x
      && p.y !== points[i]!.y)) throw new Error(`${field}.route must be orthogonal`)
  }
  return {
    content: parseRichTextContent(input.content, `${field}.content`),
    background: input.background === null ? null : parseTextBackground(input.background, `${field}.background`),
    target, label, route, stroke: parseStroke(input.stroke, `${field}.stroke`) as CalloutPayload['stroke'],
    targetMarker: marker(input.targetMarker, `${field}.targetMarker`), labelMarker: marker(input.labelMarker,
      `${field}.labelMarker`),
    ...(input.attachment === undefined ? {} : { attachment: input.attachment as CalloutAttachment }),
    ...(input.frame === undefined ? {} : { frame: parseCalloutFrame(input.frame, `${field}.frame`) }),
    ...(input.targetMarkerStyle === undefined ? {} : { targetMarkerStyle: markerStyle(input.targetMarkerStyle,
      `${field}.targetMarkerStyle`) }),
    ...(input.labelMarkerStyle === undefined ? {} : { labelMarkerStyle: markerStyle(input.labelMarkerStyle,
      `${field}.labelMarkerStyle`) }),
  }
}

/** Preferences carry appearance only; never accept route points or document content. */
export function parseCalloutStyle(value: unknown): CalloutStyle | null {
  if (value === null) return null
  const input = readJsonObject(value, 'calloutStyle')
  assertOnlyFields(input, ['frame', 'route', 'targetMarker', 'labelMarker', 'targetMarkerStyle',
    'labelMarkerStyle'], 'calloutStyle')
  if (!['straight', 'corner', 'elbow'].includes(String(input.route))) throw new Error('invalid callout style route')
  return {
    frame: parseCalloutFrame(input.frame, 'calloutStyle.frame'),
    route: input.route as CalloutStyle['route'],
    targetMarker: marker(input.targetMarker, 'calloutStyle.targetMarker'),
    labelMarker: marker(input.labelMarker, 'calloutStyle.labelMarker'),
    ...(input.targetMarkerStyle === undefined ? {} : { targetMarkerStyle: markerStyle(input.targetMarkerStyle,
      'calloutStyle.targetMarkerStyle') }),
    ...(input.labelMarkerStyle === undefined ? {} : { labelMarkerStyle: markerStyle(input.labelMarkerStyle,
      'calloutStyle.labelMarkerStyle') }),
  }
}
