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

type State = PrecisionEffectState<'censor'>

function result(
  state: State,
  defaults: State['defaults'],
  after?: LayerNode,
): PrecisionSettingsEffect {
  if (state.selected && after) return updateLayerEffect(state.selected, after)
  return state.selected ? HANDLED : defaultsEffect(defaults)
}

function regionEffect(value: string, state: State): PrecisionSettingsEffect {
  if (value !== 'rectangle' && value !== 'freeform') return HANDLED
  const defaults: State['defaults'] = {
    ...state.defaults,
    censor: { ...state.defaults.censor, region: value },
  }
  const selected = state.selected
  const after = selected
    ? {
        ...selected,
        payload: {
          ...selected.payload,
          region:
            value === 'rectangle'
              ? { kind: 'rectangle' as const }
              : {
                  kind: 'freeform' as const,
                  points: [
                    { x: 0, y: 0 },
                    { x: selected.localBounds.width, y: 0 },
                    {
                      x: selected.localBounds.width,
                      y: selected.localBounds.height,
                    },
                    { x: 0, y: selected.localBounds.height },
                  ],
                },
        },
      }
    : undefined
  return result(state, defaults, after)
}

function modeEffect(value: string, state: State): PrecisionSettingsEffect {
  if (value !== 'pixelate' && value !== 'blur' && value !== 'solid') {
    return HANDLED
  }
  const defaults: State['defaults'] = {
    ...state.defaults,
    censor: { ...state.defaults.censor, mode: value },
  }
  const effect: NonNullable<State['selected']>['payload']['effect'] =
    value === 'pixelate'
      ? { mode: value, blockSize: defaults.censor.blockSize }
      : value === 'blur'
        ? { mode: value, strength: defaults.censor.blurStrength }
        : { mode: value, color: defaults.censor.solidColor }
  const after = state.selected
    ? {
        ...state.selected,
        payload: { ...state.selected.payload, effect },
      }
    : undefined
  return result(state, defaults, after)
}

function numberEffect(
  id: string,
  value: string,
  state: State,
): PrecisionSettingsEffect {
  const number = Number(value)
  const blockSize = id === 'censorBlockSize'
  const valid = blockSize
    ? Number.isInteger(number) && number >= 2 && number <= 128
    : Number.isFinite(number) && number >= 0.5 && number <= 128
  if (!valid) return HANDLED
  const censor = blockSize
    ? { ...state.defaults.censor, blockSize: number }
    : { ...state.defaults.censor, blurStrength: number }
  const defaults: State['defaults'] = { ...state.defaults, censor }
  const effect = blockSize
    ? { mode: 'pixelate' as const, blockSize: number }
    : { mode: 'blur' as const, strength: number }
  const after = state.selected
    ? {
        ...state.selected,
        payload: { ...state.selected.payload, effect },
      }
    : undefined
  return result(state, defaults, after)
}

function colorEffect(value: string, state: State): PrecisionSettingsEffect {
  const color = parseHexColor(value)
  if (!color) return HANDLED
  const defaults: State['defaults'] = {
    ...state.defaults,
    censor: { ...state.defaults.censor, solidColor: color },
  }
  const after = state.selected
    ? {
        ...state.selected,
        payload: {
          ...state.selected.payload,
          effect: { mode: 'solid' as const, color },
        },
      }
    : undefined
  return result(state, defaults, after)
}

export function resolveCensorEffect(
  id: string,
  value: string,
  state: State,
): PrecisionSettingsEffect {
  if (id === 'censorRegion') return regionEffect(value, state)
  if (id === 'censorMode') return modeEffect(value, state)
  if (id === 'censorBlockSize' || id === 'censorBlurStrength') {
    return numberEffect(id, value, state)
  }
  if (id === 'censorSolidColor') return colorEffect(value, state)
  return UNHANDLED
}
