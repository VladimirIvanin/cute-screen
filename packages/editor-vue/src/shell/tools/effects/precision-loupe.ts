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

type State = PrecisionEffectState<'loupe'>

function result(
  state: State,
  defaults: State['defaults'],
  after?: LayerNode,
): PrecisionSettingsEffect {
  if (state.selected && after) return updateLayerEffect(state.selected, after)
  return state.selected ? HANDLED : defaultsEffect(defaults)
}

function sourceRegion(
  state: State,
  lensSize: number,
  zoom: number,
): { x: number; y: number; width: number; height: number } | undefined {
  const selected = state.selected
  if (!selected) return undefined
  const side = lensSize / zoom
  const canvas = state.document.canvas
  if (side > Math.min(canvas.width, canvas.height)) return undefined
  const source = selected.payload.sourceRegion
  return {
    x: Math.max(
      0,
      Math.min(canvas.width - side, source.x + source.width / 2 - side / 2),
    ),
    y: Math.max(
      0,
      Math.min(canvas.height - side, source.y + source.height / 2 - side / 2),
    ),
    width: side,
    height: side,
  }
}

function sizeEffect(
  id: string,
  value: string,
  state: State,
): PrecisionSettingsEffect {
  const number = Number(value)
  const zoomChange = id === 'loupeZoom'
  const valid = zoomChange
    ? Number.isFinite(number) && number >= 1 && number <= 16
    : Number.isFinite(number) && number >= 16 && number <= 2048
  if (!valid) return HANDLED
  const lensSize = zoomChange
    ? (state.selected?.payload.lens.size ?? state.defaults.loupe.size)
    : number
  const zoom = zoomChange
    ? number
    : (state.selected?.payload.zoom ?? state.defaults.loupe.zoom)
  const region = sourceRegion(state, lensSize, zoom)
  if (state.selected && !region) return HANDLED
  const loupe = zoomChange
    ? { ...state.defaults.loupe, zoom: number }
    : { ...state.defaults.loupe, size: number }
  const defaults: State['defaults'] = { ...state.defaults, loupe }
  const after = state.selected
    ? {
        ...state.selected,
        ...(zoomChange
          ? {}
          : {
              localBounds: {
                ...state.selected.localBounds,
                width: number,
                height: number,
              },
            }),
        payload: {
          ...state.selected.payload,
          ...(zoomChange
            ? { zoom: number }
            : {
                lens: { ...state.selected.payload.lens, size: number },
              }),
          sourceRegion: region!,
        },
      }
    : undefined
  return result(state, defaults, after)
}

function appearanceEffect(
  id: string,
  value: string,
  state: State,
): PrecisionSettingsEffect {
  if (id === 'loupeShape' && (value === 'circle' || value === 'rectangle')) {
    const defaults: State['defaults'] = {
      ...state.defaults,
      loupe: { ...state.defaults.loupe, shape: value },
    }
    const after = state.selected
      ? {
          ...state.selected,
          payload: {
            ...state.selected.payload,
            lens: {
              ...state.selected.payload.lens,
              shape: value as 'circle' | 'rectangle',
            },
          },
        }
      : undefined
    return result(state, defaults, after)
  }
  if (id === 'loupeBorderColor') {
    const color = parseHexColor(value)
    if (!color) return HANDLED
    const defaults: State['defaults'] = {
      ...state.defaults,
      loupe: { ...state.defaults.loupe, borderColor: color },
    }
    const after = state.selected
      ? {
          ...state.selected,
          payload: {
            ...state.selected.payload,
            border: { ...state.selected.payload.border, color },
          },
        }
      : undefined
    return result(state, defaults, after)
  }
  return UNHANDLED
}

function borderOrShadowEffect(
  id: string,
  value: string,
  state: State,
): PrecisionSettingsEffect {
  if (id === 'loupeBorderWidth') {
    const number = Number(value)
    if (!Number.isFinite(number) || number < 0 || number > 64) return HANDLED
    const defaults: State['defaults'] = {
      ...state.defaults,
      loupe: { ...state.defaults.loupe, borderWidth: number },
    }
    const after = state.selected
      ? {
          ...state.selected,
          payload: {
            ...state.selected.payload,
            border: { ...state.selected.payload.border, width: number },
          },
        }
      : undefined
    return result(state, defaults, after)
  }
  if (id === 'loupeShadow' && (value === 'on' || value === 'off')) {
    const enabled = value === 'on'
    const defaults: State['defaults'] = {
      ...state.defaults,
      loupe: { ...state.defaults.loupe, shadow: enabled },
    }
    const after = state.selected
      ? {
          ...state.selected,
          payload: {
            ...state.selected.payload,
            shadow: enabled
              ? (state.selected.payload.shadow ?? {
                  color: { red: 0, green: 0, blue: 0, alpha: 0.35 },
                  offsetX: 0,
                  offsetY: 6,
                  blur: 14,
                })
              : null,
          },
        }
      : undefined
    return result(state, defaults, after)
  }
  return id.startsWith('loupe') ? HANDLED : UNHANDLED
}

export function resolveLoupeEffect(
  id: string,
  value: string,
  state: State,
): PrecisionSettingsEffect {
  if (id === 'loupeZoom' || id === 'loupeSize') {
    return sizeEffect(id, value, state)
  }
  const appearance = appearanceEffect(id, value, state)
  return appearance.kind === 'unhandled'
    ? borderOrShadowEffect(id, value, state)
    : appearance
}
