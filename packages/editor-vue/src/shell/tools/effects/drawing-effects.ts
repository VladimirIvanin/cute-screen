import type { Ref, ShallowRef } from 'vue'
import {
  rebaseArrowLayer,
  rememberDrawingColor,
  type BlendMode,
  type DrawingDefaults,
  type DrawingToolPreferencesV2,
  type JsonObject,
  type LayerNode,
  type SrgbColor,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../../contracts'
import type { DrawingLayerNode } from '../drawing-schema'
import type { ToolSettingsEffect } from './contracts'
import {
  isDrawingControlId,
  resolveDrawingPayload,
  type DrawingControlId,
  type DrawingTool,
} from './drawing-payload'

interface DrawingTarget {
  readonly tool: DrawingTool
  readonly selected: DrawingLayerNode | undefined
  readonly current: JsonObject
}

interface DrawingDefaultsEffect {
  readonly kind: 'defaults'
  readonly value: DrawingDefaults
  readonly rememberColor: boolean
  readonly tool: DrawingTool
  readonly payload: JsonObject
}

type DrawingEffect =
  | Exclude<ToolSettingsEffect<DrawingDefaults>, { readonly kind: 'defaults' }>
  | DrawingDefaultsEffect

export interface DrawingEffectsContext {
  readonly props: ResolvedEditorShellProps
  readonly activeToolId: Ref<string | undefined>
  readonly configureDefaultsTool: Ref<'arrow' | undefined>
  readonly drawingDefaults: Ref<DrawingDefaults>
  readonly drawingPreferences: ShallowRef<DrawingToolPreferencesV2>
  readonly isDrawingTool: (value: string | undefined) => value is DrawingTool
  readonly selectedDrawingLayer: () => DrawingLayerNode | undefined
  readonly savePreferences: (value: DrawingToolPreferencesV2) => void
}

function targetFor(context: DrawingEffectsContext): DrawingTarget | undefined {
  const activeTool = context.activeToolId.value
  const candidate = context.selectedDrawingLayer()
  const selected = context.configureDefaultsTool.value
    ? undefined
    : context.isDrawingTool(activeTool)
      ? candidate?.kind === activeTool
        ? candidate
        : undefined
      : activeTool === 'select'
        ? candidate
        : undefined
  const tool =
    context.configureDefaultsTool.value ??
    (context.isDrawingTool(activeTool)
      ? activeTool
      : selected && context.isDrawingTool(selected.kind)
        ? selected.kind
        : undefined)
  if (!tool) return undefined
  return {
    tool,
    selected,
    current: selected ? selected.payload : context.drawingDefaults.value[tool],
  }
}

function selectedAfter(
  selected: DrawingLayerNode,
  id: DrawingControlId,
  value: string,
  payload: JsonObject,
): LayerNode {
  let after = {
    ...selected,
    ...(id === 'layerOpacity'
      ? { opacity: payload.layerOpacity as number }
      : {}),
    ...(id === 'blendMode'
      ? { blendMode: payload.blendMode as BlendMode }
      : {}),
    ...(id === 'layerOpacity' || id === 'blendMode' ? {} : { payload }),
    ...(id === 'markerMode'
      ? {
          blendMode:
            value === 'darken' ? ('darken' as const) : ('multiply' as const),
        }
      : {}),
  } as LayerNode
  if (
    selected.kind === 'arrow' &&
    id !== 'layerOpacity' &&
    id !== 'blendMode'
  ) {
    after = rebaseArrowLayer(selected, payload as typeof selected.payload)
  }
  return after
}

function resolveDrawingEffect(
  context: DrawingEffectsContext,
  id: string,
  value: string,
): DrawingEffect {
  if (!isDrawingControlId(id)) return { kind: 'unhandled' }
  const target = targetFor(context)
  if (!target) return { kind: 'unhandled' }
  const payload = resolveDrawingPayload(id, value, target.tool, target.current)
  if (!payload) return { kind: 'handled' }
  if (target.selected) {
    if (!context.props.documentSession || target.selected.locked) {
      return { kind: 'handled' }
    }
    return {
      kind: 'command',
      command: {
        type: 'updateLayer',
        before: target.selected,
        after: selectedAfter(target.selected, id, value, payload),
      },
    }
  }
  return {
    kind: 'defaults',
    value: { ...context.drawingDefaults.value, [target.tool]: payload },
    rememberColor: id === 'color',
    tool: target.tool,
    payload,
  }
}

function colorFrom(
  tool: DrawingTool,
  payload: JsonObject,
): SrgbColor | undefined {
  const candidate =
    tool === 'arrow' || tool === 'shape'
      ? (payload.stroke as Record<string, unknown> | undefined)?.color
      : payload.color
  return candidate && typeof candidate === 'object'
    ? (candidate as SrgbColor)
    : undefined
}

export function createDrawingEffects(context: DrawingEffectsContext) {
  function applyDrawingChange(id: string, value: string): boolean {
    const effect = resolveDrawingEffect(context, id, value)
    if (effect.kind === 'unhandled') return false
    if (effect.kind === 'command') {
      context.props.documentSession?.execute(effect.command)
      return true
    }
    if (effect.kind !== 'defaults') return true
    context.drawingDefaults.value = effect.value
    let preferences = {
      ...context.drawingPreferences.value,
      defaults: effect.value,
    }
    if (effect.rememberColor) {
      const color = colorFrom(effect.tool, effect.payload)
      if (color) preferences = rememberDrawingColor(preferences, color)
    }
    context.drawingPreferences.value = preferences
    context.savePreferences(preferences)
    return true
  }
  return { applyDrawingChange }
}
