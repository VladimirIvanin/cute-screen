import { rebaseRulerLayer, type LayerNode } from '@cute-screen/editor-renderer'
import type { PrecisionSettingsEffect } from './contracts'
import { updateLayerEffect } from './contracts'
import { parseHexColor } from './color'
import {
  defaultsEffect,
  HANDLED,
  type PrecisionEffectState,
  UNHANDLED,
} from './precision-contracts'

type State = PrecisionEffectState<'ruler'>

function result(
  state: State,
  defaults: State['defaults'],
  after?: LayerNode,
): PrecisionSettingsEffect {
  if (state.selected && after?.kind === 'ruler') {
    return updateLayerEffect(
      state.selected,
      rebaseRulerLayer(state.selected, after.payload, state.document.canvas),
    )
  }
  return state.selected ? HANDLED : defaultsEffect(defaults)
}

function numericEffect(
  id: string,
  value: string,
  state: State,
): PrecisionSettingsEffect {
  const number = Number(value)
  const valid =
    id === 'rulerThickness'
      ? Number.isFinite(number) && number >= 1 && number <= 12
      : id === 'rulerFontSize'
        ? Number.isFinite(number) && number >= 10 && number <= 48
        : Number.isFinite(number) && number > 0 && number <= 90
  if (!valid) return HANDLED
  const ruler =
    id === 'rulerThickness'
      ? { ...state.defaults.ruler, thickness: number }
      : id === 'rulerFontSize'
        ? { ...state.defaults.ruler, fontSize: number }
        : { ...state.defaults.ruler, snapAngleIncrementDegrees: number }
  const defaults: State['defaults'] = { ...state.defaults, ruler }
  const payload = state.selected
    ? id === 'rulerThickness'
      ? { ...state.selected.payload, thickness: number }
      : id === 'rulerFontSize'
        ? { ...state.selected.payload, fontSize: number }
        : {
            ...state.selected.payload,
            snapAngleIncrementDegrees: number,
          }
    : undefined
  const after =
    state.selected && payload ? { ...state.selected, payload } : undefined
  return result(state, defaults, after)
}

export function resolveRulerEffect(
  id: string,
  value: string,
  state: State,
): PrecisionSettingsEffect {
  if (id === 'rulerColor') {
    const color = parseHexColor(value)
    if (!color) return HANDLED
    const defaults: State['defaults'] = {
      ...state.defaults,
      ruler: { ...state.defaults.ruler, color },
    }
    const after = state.selected
      ? {
          ...state.selected,
          payload: { ...state.selected.payload, color },
        }
      : undefined
    return result(state, defaults, after)
  }
  if (
    id === 'rulerThickness' ||
    id === 'rulerFontSize' ||
    id === 'rulerAngle'
  ) {
    return numericEffect(id, value, state)
  }
  if (id === 'rulerUnit' && (value === 'pixels' || value === 'percent')) {
    const defaults: State['defaults'] = {
      ...state.defaults,
      ruler: { ...state.defaults.ruler, unit: value },
    }
    const after = state.selected
      ? {
          ...state.selected,
          payload: {
            ...state.selected.payload,
            unit: value as 'pixels' | 'percent',
          },
        }
      : undefined
    return result(state, defaults, after)
  }
  if (id === 'rulerSnap' && (value === 'on' || value === 'off')) {
    const defaults: State['defaults'] = {
      ...state.defaults,
      ruler: { ...state.defaults.ruler, snap: value === 'on' },
    }
    return result(state, defaults)
  }
  return id.startsWith('ruler') ? HANDLED : UNHANDLED
}
