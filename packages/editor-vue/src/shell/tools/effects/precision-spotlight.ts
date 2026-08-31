import type { LayerNode } from '@cute-screen/editor-renderer'
import type { PrecisionSettingsEffect } from './contracts'
import { updateLayerEffect } from './contracts'
import { parseHexColor } from './color'
import {
  defaultsEffect,
  HANDLED,
  type PrecisionEffectState,
  UNHANDLED,
} from './precision-contracts'

type State = PrecisionEffectState<'spotlight'>

function result(
  state: State,
  defaults: State['defaults'],
  after?: LayerNode,
): PrecisionSettingsEffect {
  if (state.selected && after) return updateLayerEffect(state.selected, after)
  return state.selected ? HANDLED : defaultsEffect(defaults)
}

function shapeEffect(value: string, state: State): PrecisionSettingsEffect {
  if (value !== 'rectangle' && value !== 'ellipse' && value !== 'diamond') {
    return HANDLED
  }
  const defaults: State['defaults'] = {
    ...state.defaults,
    spotlight: { ...state.defaults.spotlight, shape: value },
  }
  const after: State['selected'] = state.selected
    ? {
        ...state.selected,
        payload: { ...state.selected.payload, shape: value },
      }
    : undefined
  return result(state, defaults, after)
}

function colorEffect(value: string, state: State): PrecisionSettingsEffect {
  const dimColor = parseHexColor(value)
  if (!dimColor) return HANDLED
  const defaults: State['defaults'] = {
    ...state.defaults,
    spotlight: { ...state.defaults.spotlight, dimColor },
  }
  const after: State['selected'] = state.selected
    ? {
        ...state.selected,
        payload: { ...state.selected.payload, dimColor },
      }
    : undefined
  return result(state, defaults, after)
}

function opacityEffect(value: string, state: State): PrecisionSettingsEffect {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 100) return HANDLED
  const dimOpacity = number / 100
  const defaults: State['defaults'] = {
    ...state.defaults,
    spotlight: { ...state.defaults.spotlight, dimOpacity },
  }
  const after: State['selected'] = state.selected
    ? {
        ...state.selected,
        payload: { ...state.selected.payload, dimOpacity },
      }
    : undefined
  return result(state, defaults, after)
}

function featherEffect(value: string, state: State): PrecisionSettingsEffect {
  if (value !== 'none' && value !== 'soft' && value !== 'strong') return HANDLED
  const feather: 'soft' | 'strong' | null = value === 'none' ? null : value
  const defaults: State['defaults'] = {
    ...state.defaults,
    spotlight: { ...state.defaults.spotlight, feather },
  }
  const after: State['selected'] = state.selected
    ? {
        ...state.selected,
        payload: { ...state.selected.payload, feather },
      }
    : undefined
  return result(state, defaults, after)
}

export function resolveSpotlightEffect(
  id: string,
  value: string,
  state: State,
): PrecisionSettingsEffect {
  if (id === 'spotlightShape') return shapeEffect(value, state)
  if (id === 'spotlightDimColor') return colorEffect(value, state)
  if (id === 'spotlightDimOpacity') return opacityEffect(value, state)
  if (id === 'spotlightFeather') return featherEffect(value, state)
  return id.startsWith('spotlight') ? HANDLED : UNHANDLED
}
