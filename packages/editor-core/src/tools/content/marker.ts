import type {
  LayerNode,
  NumberedMarkerLayer,
  Point,
  SrgbColor,
} from '../../document/types'
import {
  DEFAULT_TEXT_FONT_FAMILY,
  IDENTITY,
  WHITE_COLOR,
  assertFinitePoint,
  solidColor,
} from './shared'

export function createNumberedMarkerLayer(input: {
  readonly id: string
  readonly sequence: number
  readonly origin: Point
  readonly shape?: NumberedMarkerLayer['payload']['badge']['shape']
  readonly badgeColor?: SrgbColor
}): NumberedMarkerLayer {
  assertFinitePoint(input.origin)
  if (!Number.isInteger(input.sequence) || input.sequence <= 0) {
    throw new Error('numbered marker sequence must be a positive integer')
  }
  const localBounds = { x: 0, y: 0, width: 32, height: 32 }
  return Object.freeze({
    id: input.id,
    kind: 'numberedMarker',
    transform: {
      ...IDENTITY,
      translateX: input.origin.x - (localBounds.x + localBounds.width / 2),
      translateY: input.origin.y - (localBounds.y + localBounds.height / 2),
    },
    localBounds,
    visible: true,
    locked: false,
    payload: {
      sequence: input.sequence,
      label: {
        text: String(input.sequence),
        wrap: 'autoSize' as const,
        spans: [
          {
            start: 0,
            end: String(input.sequence).length,
            fontFamily: DEFAULT_TEXT_FONT_FAMILY,
            fontSize: 16,
            color: WHITE_COLOR,
            weight: 700 as const,
            italic: false,
            strikethrough: false,
          },
        ],
        paragraphs: [
          {
            start: 0,
            end: String(input.sequence).length,
            alignment: 'center' as const,
            listKind: 'none' as const,
          },
        ],
      },
      badge: {
        shape: input.shape ?? 'circle',
        color: solidColor(input.badgeColor),
      },
    },
  })
}

export function nextNumberedMarkerSequence(
  layers: readonly LayerNode[],
): number {
  const used = new Set(
    layers.flatMap((layer) =>
      layer.kind === 'numberedMarker' ? [layer.payload.sequence] : [],
    ),
  )
  let candidate = 1
  while (used.has(candidate)) candidate += 1
  return candidate
}
