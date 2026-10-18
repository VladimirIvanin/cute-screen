import {
  createCalloutLayer,
  calloutBackground,
  calloutRoutePreset,
  defaultCalloutAttachment,
  DEFAULT_CALLOUT_FRAME,
  parseCalloutPayload,
  addCalloutStep,
  removeCalloutStep,
  resetCalloutRoute,
  rebaseCalloutLayer,
  calloutGeometryContext,
  type CalloutLayer,
  type CalloutPayload,
  type CalloutStyle,
} from '@cute-screen/editor-renderer'
import type { TextEffectsContext } from './text-effects-contracts'

function patchedFrame(
  current: CalloutPayload,
  value: string,
): CalloutPayload {
  const patch = JSON.parse(value) as Partial<NonNullable<CalloutPayload['frame']>>
  const frame = current.frame ?? calloutStyleFromPayload(current).frame
  const border = !frame.border && (patch.kind === 'outline' || patch.kind === 'accent')
    ? { ...DEFAULT_CALLOUT_FRAME.border!, width: patch.kind === 'accent' ? 3 : 1 } : frame.border
  return { ...current, frame: { ...frame, border, ...patch },
    attachment: current.attachment ?? defaultCalloutAttachment() }
}
function changedPayload(
  layer: CalloutLayer,
  id: string,
  value: string,
): CalloutLayer {
  const current = layer.payload
  const context = calloutGeometryContext()
  if (id === 'calloutRemoveStep') return removeCalloutStep(layer, context)
  if (id === 'calloutReset') return resetCalloutRoute(layer, context)
  if (id === 'calloutAddStep') return addCalloutStep(layer, Number(value), 32, context)
  let payload: CalloutPayload = current
  const route = current.route
  const axis = routeAxis(route)
  if (id === 'calloutRoute') payload = { ...current, route: value === 'straight' ? { path: 'straight' }
    : value === 'elbow' ? { path: 'elbow', elbow: { axis, offset: 0 } } : { path: 'corner', axis } }
  if (id === 'calloutFlip') payload = { ...current, route: { path: 'corner', axis: axis === 'x' ? 'y' : 'x' } }
  if (id === 'calloutAttachment') payload = { ...current,
    attachment: value as NonNullable<CalloutPayload['attachment']> }
  if (id === 'calloutFrame') payload = patchedFrame(current, value)
  if (id === 'calloutTargetMarker' || id === 'calloutLabelMarker') payload = { ...current,
    [id === 'calloutTargetMarker' ? 'targetMarker' : 'labelMarker']: value }
  if (id === 'calloutTargetMarkerStyle' || id === 'calloutLabelMarkerStyle') {
    const key = id === 'calloutTargetMarkerStyle' ? 'targetMarkerStyle' : 'labelMarkerStyle'
    const patch = JSON.parse(value) as NonNullable<CalloutPayload[typeof key]>
    payload = { ...current, [key]: Object.keys(patch).length ? { ...current[key], ...patch } : {} }
  }
  return rebaseCalloutLayer(layer, parseCalloutPayload(payload, 'callout'), context)
}
function routeAxis(route: CalloutPayload['route']): 'x' | 'y' {
  if (route.path === 'elbow') return route.elbow.axis
  if (route.path === 'straight' || route.path === 'quadratic') return 'y'
  return route.axis
}
export function calloutStyleFromPayload(payload: CalloutPayload): CalloutStyle {
  return { frame: payload.frame ?? { ...DEFAULT_CALLOUT_FRAME, kind: payload.background ? 'card' : 'text',
    ...(payload.background ? { fill: payload.background.color, padding: payload.background.padding,
      radius: payload.background.radius } : {}) },
  route: calloutRoutePreset(payload.route), targetMarker: payload.targetMarker, labelMarker: payload.labelMarker,
  ...(payload.targetMarkerStyle ? { targetMarkerStyle: payload.targetMarkerStyle } : {}),
  ...(payload.labelMarkerStyle ? { labelMarkerStyle: payload.labelMarkerStyle } : {}),
  }
}
export function applyCalloutChange(
  context: TextEffectsContext,
  id: string,
  value: string,
  revision: () => number,
): boolean {
  if (!['calloutRoute', 'calloutFlip', 'calloutAttachment', 'calloutFrame', 'calloutTargetMarker',
    'calloutLabelMarker', 'calloutTargetMarkerStyle', 'calloutLabelMarkerStyle', 'calloutInsert',
    'calloutAddStep', 'calloutRemoveStep', 'calloutReset'].includes(id)) return false
  if (context.props.readOnlyDocument || context.textDraft.value) return true
  const selected = context.activeDocument.value?.layers.filter(
    (layer) => context.store.selectedLayerIds.includes(layer.id),
  ) ?? []
  if (selected.some((layer) => layer.locked || layer.kind !== 'callout')) return true
  if (id === 'calloutInsert') {
    if (selected.length === 1) context.textFormatting.value = { revision: revision(),
      calloutInsertStep: selected[0]!.id }
    return true
  }
  try {
    const defaults = context.configuringCallout?.() || selected.length === 0
    const layers = defaults ? [createCalloutLayer({ id: '__defaults__', text: 'Label', target: { x: 0, y: 0 },
      label: { x: 120, y: 60 },
      ...(context.textDefaults.value.calloutStyle === undefined ? {}
        : { style: context.textDefaults.value.calloutStyle }) })!] : selected as CalloutLayer[]
    const commands = layers.map((before) => ({ type: 'updateLayer' as const, before,
      after: changedPayload(before, id, value) }))
      .filter(({ before, after }) => JSON.stringify(before) !== JSON.stringify(after))
    if (!commands.length) return true
    if (!defaults) context.props.documentSession?.execute(commands.length === 1 ? commands[0]!
      : { type: 'batch', commands })
    if (defaults || selected.length === 1) {
      const payload = commands[0]!.after.payload
      context.textDefaults.value = { ...context.textDefaults.value,
        calloutStyle: calloutStyleFromPayload(payload), background: calloutBackground(payload) }
    }
  } catch (error) {
    console.warn('Invalid callout settings', error)
  }
  return true
}
