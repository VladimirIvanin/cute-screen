import type { Ref } from 'vue'
import {
  changePencilBrush,
  normalizePencilDefaults,
  DEFAULT_CALLOUT_STYLE,
  calloutFrameBackground,
  type CalloutFrame,
} from '@cute-screen/editor-renderer'
import type {
  JsonObject,
  LayerStyle,
} from '@cute-screen/editor-renderer'
import type { createWorkspaceState } from './workspace-state'
import type { TextToolDefaults } from '../canvas/contracts'
type Workspace = ReturnType<typeof createWorkspaceState>
type TextKind = 'text' | 'callout' | 'numberedMarker'
const pick = (style: LayerStyle, keys: readonly string[]) =>
  Object.fromEntries(Object.entries(style).filter(([key]) => keys.includes(key)))
function drawingStyle(
  workspace: Workspace,
  tool: string,
  style: LayerStyle,
): void {
  if (!['arrow', 'shape', 'pencil', 'marker'].includes(tool)) return
  const id = tool as 'arrow' | 'shape' | 'pencil' | 'marker'
  const existing = workspace.drawingDefaults.value[id]
  const payload = { ...(id === 'pencil' && typeof style.brush === 'string'
    ? changePencilBrush(existing, style.brush === 'pencil' ? 'pen' : style.brush)
    : existing) }
  if (id === 'arrow' || id === 'shape') {
    const stroke = { ...(payload.stroke as JsonObject), ...pick(style, ['color', 'width']) }
    if ('strokeStyle' in style) stroke.style = style.strokeStyle!
    payload.stroke = stroke
  } else Object.assign(payload, pick(style, ['color', 'width', 'brush', 'smoothing', ...(id === 'marker' ? ['highlighterMode'] : [])]))
  Object.assign(
    payload,
    pick(
      style,
      ['fill', 'cornerRadius', 'startCap', 'endCap'].filter((key) => key in payload),
    ),
  )
  if ('opacity' in style) payload.layerOpacity = style.opacity!
  if ('blendMode' in style) payload.blendMode = style.blendMode!
  if (id === 'marker') {
    delete payload.mode
    if (payload.highlighterMode === 'auto') delete payload.blendMode
    else if ('blendMode' in style) payload.highlighterMode = ({ screen: 'illuminate', normal: 'veil' } as Record<string, string>)[String(style.blendMode)] ?? 'highlight'
  }
  workspace.drawingDefaults.value = { ...workspace.drawingDefaults.value, [id]: id === 'pencil' ? normalizePencilDefaults(payload) : payload }
}
function textStyle(
  workspace: Workspace,
  texts: Record<TextKind, TextToolDefaults>,
  kind: Ref<TextKind>,
  tool: TextKind,
  style: LayerStyle,
): void {
  const patch = pick(style, [
    'fontFamily',
    'fontSize',
    'weight',
    'italic',
    'strikethrough',
    'alignment',
    'listKind',
    'background',
  ])
  if (tool === 'numberedMarker' && 'badgeColor' in style) patch.background = { color: style.badgeColor!, padding: 0, radius: 0 }
  if (tool === 'callout') {
    const base = texts.callout.calloutStyle ?? DEFAULT_CALLOUT_STYLE
    patch.calloutStyle = { ...base, ...('calloutFrame' in style ? { frame: style.calloutFrame } : {}), ...('calloutRoute' in style ? { route: style.calloutRoute } : {}), ...pick(style, ['targetMarker', 'labelMarker', 'targetMarkerStyle', 'labelMarkerStyle']) } as unknown as JsonObject
    if (style.calloutFrame)
      patch.background = calloutFrameBackground(style.calloutFrame as CalloutFrame) as unknown as JsonObject
  }
  texts[tool] = {
    ...texts[tool],
    ...patch,
    ...('textColor' in style ? { color: style.textColor as unknown as TextToolDefaults['color'] } : {}),
  }
  if (!workspace.textDraft.value && kind.value === tool)
    workspace.textDefaults.value = JSON.parse(JSON.stringify(texts[tool])) as TextToolDefaults
  if (tool === 'callout') {
    const current = workspace.calloutStroke.value
    workspace.calloutStroke.value = {
      ...current,
      ...pick(style, ['color', 'width']),
      ...('strokeStyle' in style ? { style: style.strokeStyle as typeof current.style } : {}),
    }
  }
  if (tool === 'numberedMarker' && typeof style.badgeShape === 'string')
    workspace.markerShape.value = style.badgeShape as typeof workspace.markerShape.value
}
function rulerStyle(
  workspace: Workspace,
  style: LayerStyle,
): void {
  const current = workspace.precisionDefaults.value.ruler
  const thickness = typeof style.width === 'number' && style.width <= 12 ? style.width : current.thickness
  const fontSize = typeof style.fontSize === 'number' && style.fontSize <= 48 ? style.fontSize : current.fontSize
  workspace.precisionDefaults.value = {
    ...workspace.precisionDefaults.value,
    ruler: { ...current, ...pick(style, ['color']), thickness, fontSize },
  }
}
function loupeStyle(
  workspace: Workspace,
  style: LayerStyle,
): void {
  const current = workspace.precisionDefaults.value.loupe
  const border = style.lensBorder as JsonObject | undefined
  workspace.precisionDefaults.value = {
    ...workspace.precisionDefaults.value,
    loupe: {
      ...current,
      ...pick(style, ['zoom']),
      ...(border
        ? { borderColor: border.color as unknown as typeof current.borderColor, borderWidth: border.width as number }
        : {}),
      ...('shadow' in style ? { shadow: style.shadow !== null } : {}),
    },
  }
}
function censorStyle(
  workspace: Workspace,
  style: LayerStyle,
): void {
  if (!style.effect || typeof style.effect !== 'object') return
  const effect = style.effect as JsonObject
  const current = workspace.precisionDefaults.value.censor
  const parameters =
    effect.mode === 'pixelate'
      ? { blockSize: effect.blockSize as number }
      : effect.mode === 'blur'
        ? { blurStrength: effect.strength as number }
        : { solidColor: effect.color as unknown as typeof current.solidColor }
  workspace.precisionDefaults.value = {
    ...workspace.precisionDefaults.value,
    censor: { ...current, mode: effect.mode as typeof current.mode, ...parameters },
  }
}
export function syncRememberedToolStyles(
  workspace: Workspace,
  texts: Record<TextKind, TextToolDefaults>,
  kind: Ref<TextKind>,
): void {
  for (const [tool, style] of Object.entries(workspace.rememberedStyles.value)) {
    if (!style || !Object.keys(style).length) continue
    drawingStyle(workspace, tool, style)
    if (['text', 'callout', 'numberedMarker'].includes(tool)) textStyle(workspace, texts, kind, tool as TextKind, style)
    if (tool === 'ruler') rulerStyle(workspace, style)
    if (tool === 'loupe') loupeStyle(workspace, style)
    if (tool === 'censor') censorStyle(workspace, style)
    if (tool === 'spotlight')
      workspace.precisionDefaults.value = {
        ...workspace.precisionDefaults.value,
        spotlight: {
          ...workspace.precisionDefaults.value.spotlight,
          ...pick(style, ['dimColor', 'dimOpacity', 'feather']),
        },
      }
  }
}
