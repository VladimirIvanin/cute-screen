import {
  gradientFrame,
  isGradientLayer,
  placeGradientLayer,
  type EditorDocumentV1,
  type JsonObject,
  type LayerNode,
} from '@cute-screen/editor-renderer'
import type {
  ContextToolbarSchema,
  ShapeFill,
  TranslationKey,
} from '../types'
import { GRADIENT_PLACEMENTS } from './gradient-placement'

export function gradientSchema(input: {
  document: EditorDocumentV1 | undefined
  layer: LayerNode | undefined
  values: JsonObject
  disabled: boolean
  defaultsOnly: boolean
  count: number
  translate: (key: TranslationKey) => string
}): ContextToolbarSchema {
  const { document, values, defaultsOnly, translate } = input
  const layer = isGradientLayer(input.layer) ? input.layer : undefined
  const single = !defaultsOnly && input.count === 1
  const rotated = Boolean(layer && Math.abs(layer.transform.rotation % 360) > 1e-8)
  const blocked = input.disabled || rotated || !single
  const matches = !blocked && layer && document ? GRADIENT_PLACEMENTS.filter((action) =>
    placeGradientLayer(layer, gradientFrame(document), action.placement) === layer) : []
  const widthFits = matches.some((action) => action.placement === 'width')
  const heightFits = matches.some((action) => action.placement === 'height')
  const activeActions = matches.filter((action) =>
    !(widthFits && ['left', 'centerX', 'right'].includes(action.placement) ||
      heightFits && ['top', 'centerY', 'bottom'].includes(action.placement))).map((action) => action.id)
  return {
    gradient: { single, width: layer?.localBounds?.width ?? 1, height: layer?.localBounds?.height ?? 1, activeActions },
    icon: 'gradient', title: translate('toolGradient'), hint: translate('canvasViewport'),
    shape: { fill: values.fill as ShapeFill, fillSupported: true, fillColorEditable: false, fillOpacityEditable: true },
    controls: [
      { kind: 'range', id: 'layerOpacity', label: translate('opacity'),
        value: layer ? layer.opacity * 100 : Number(values.layerOpacity ?? 1) * 100,
        min: 0, max: 100, step: 1, disabled: input.disabled },
      ...(!defaultsOnly ? GRADIENT_PLACEMENTS.map((action) => ({ kind: 'action' as const,
        id: action.id, label: translate(action.id), disabled: blocked,
        ...(rotated ? { disabledReason: translate('gradientResetRotation') } : {}) })) : []),
    ],
  }
}
