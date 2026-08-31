import { measureRuler } from '../../tools/precision/ruler'
import type { RenderNode } from '../../scene/contracts'
import type {
  CensorLayer,
  EditorDocumentV1,
  LoupeLayer,
  RulerLayer,
  SpotlightLayer,
} from '../types'
import { color } from './shared'

export function precisionNodes(
  layer: CensorLayer | SpotlightLayer | RulerLayer | LoupeLayer,
  document: EditorDocumentV1,
): readonly RenderNode[] {
  const common = {
    id: layer.id,
    rotation: layer.transform.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    blendMode: layer.blendMode,
  }
  const localBounds = layer.localBounds
  if (layer.kind === 'censor') {
    const region =
      layer.payload.region.kind === 'rectangle'
        ? Object.freeze({
            kind: 'rectangle' as const,
            x: layer.transform.translateX + localBounds.x,
            y: layer.transform.translateY + localBounds.y,
            width: localBounds.width,
            height: localBounds.height,
          })
        : Object.freeze({
            kind: 'freeform' as const,
            points: Object.freeze(
              layer.payload.region.points.map((point) =>
                Object.freeze({
                  x: layer.transform.translateX + point.x,
                  y: layer.transform.translateY + point.y,
                }),
              ),
            ),
          })
    return [
      {
        ...common,
        kind: 'censor',
        region,
        effect:
          layer.payload.effect.mode === 'solid'
            ? Object.freeze({
                ...layer.payload.effect,
                color: color(layer.payload.effect.color),
              })
            : layer.payload.effect,
        sampleSource: 'compositeBelow',
      },
    ]
  }
  if (layer.kind === 'spotlight') {
    return [
      {
        ...common,
        kind: 'spotlight',
        aperture: Object.freeze({
          shape: layer.payload.shape,
          x: layer.transform.translateX + localBounds.x,
          y: layer.transform.translateY + localBounds.y,
          width: localBounds.width,
          height: localBounds.height,
        }),
        dimColor: color(layer.payload.dimColor),
        dimOpacity: layer.payload.dimOpacity,
        feather: layer.payload.feather,
      },
    ]
  }
  if (layer.kind === 'ruler') {
    const measurement = measureRuler(layer, document.canvas)
    return [
      {
        ...common,
        kind: 'ruler',
        x1: layer.transform.translateX + layer.payload.start.x,
        y1: layer.transform.translateY + layer.payload.start.y,
        x2: layer.transform.translateX + layer.payload.end.x,
        y2: layer.transform.translateY + layer.payload.end.y,
        ...measurement,
        unit: layer.payload.unit,
        color: layer.payload.color,
        thickness: layer.payload.thickness,
        fontSize: layer.payload.fontSize,
      },
    ]
  }
  return [
    {
      ...common,
      kind: 'loupe',
      sourceRegion: layer.payload.sourceRegion,
      lens: Object.freeze({
        shape: layer.payload.lens.shape,
        x: layer.transform.translateX + localBounds.x,
        y: layer.transform.translateY + localBounds.y,
        size: layer.payload.lens.size,
      }),
      zoom: layer.payload.zoom,
      border: Object.freeze({
        color: color(layer.payload.border.color),
        width: layer.payload.border.width,
      }),
      shadow:
        layer.payload.shadow === null
          ? null
          : Object.freeze({
              ...layer.payload.shadow,
              color: color(layer.payload.shadow.color),
            }),
      sampleSource: 'compositeBelow',
    },
  ]
}

/** Converts persisted nodes to renderer-neutral, ordered scene nodes. */
