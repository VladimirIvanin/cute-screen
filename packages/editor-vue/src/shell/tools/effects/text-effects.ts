import type { Ref, ShallowRef } from 'vue'
import {
  applyRichTextParagraphStyle,
  applyRichTextSpanStyle,
  rebaseCalloutLayer,
  type EditorDocumentV1,
  type LayerNode,
  type RichTextParagraphStyle,
  type RichTextSpanStyle,
  type TextBackground,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../../contracts'
import type {
  TextFormattingPatch,
  TextToolDefaults,
} from '../../canvas/contracts'
import type { TextDraft } from '../text-schema'
import { parseHexColor } from './color'

type TextLayer = Extract<
  LayerNode,
  { readonly kind: 'text' | 'callout' | 'numberedMarker' }
>
type SpanPatch = {
  -readonly [K in keyof RichTextSpanStyle]?: RichTextSpanStyle[K]
}
type ParagraphPatch = {
  -readonly [K in keyof RichTextParagraphStyle]?: RichTextParagraphStyle[K]
}

interface TextChange {
  readonly defaults: TextToolDefaults
  readonly span: SpanPatch
  readonly paragraph: ParagraphPatch
  readonly background?: TextBackground | null
}

type ResolvedTextChange =
  | { readonly kind: 'unhandled' }
  | { readonly kind: 'handled' }
  | { readonly kind: 'change'; readonly change: TextChange }

export interface TextEffectsContext {
  readonly props: ResolvedEditorShellProps
  readonly store: {
    readonly selectedLayerIds: readonly string[]
    readonly selectedLayerId: string | undefined
  }
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly textDefaults: ShallowRef<TextToolDefaults>
  readonly textFormatting: ShallowRef<TextFormattingPatch | undefined>
  readonly textDraft: Ref<TextDraft | undefined>
}

function selectedTextLayer(context: TextEffectsContext): TextLayer | undefined {
  if (context.store.selectedLayerIds.length !== 1) return undefined
  const layer = context.activeDocument.value?.layers.find(
    (candidate) => candidate.id === context.store.selectedLayerId,
  )
  return layer?.kind === 'text' ||
    layer?.kind === 'callout' ||
    layer?.kind === 'numberedMarker'
    ? layer
    : undefined
}

function changed(
  defaults: TextToolDefaults,
  span: SpanPatch = {},
  paragraph: ParagraphPatch = {},
  background?: TextBackground | null,
): ResolvedTextChange {
  return {
    kind: 'change',
    change: {
      defaults,
      span,
      paragraph,
      ...(background === undefined ? {} : { background }),
    },
  }
}

function resolveSpanChange(
  id: string,
  value: string,
  defaults: TextToolDefaults,
): ResolvedTextChange {
  if (id === 'textColor') {
    const color = parseHexColor(value)
    return color
      ? changed({ ...defaults, color }, { color })
      : { kind: 'handled' }
  }
  if (id === 'textFont') {
    return value.trim()
      ? changed({ ...defaults, fontFamily: value }, { fontFamily: value })
      : { kind: 'handled' }
  }
  if (id === 'textFontSize') {
    const fontSize = Number(value)
    return Number.isInteger(fontSize) && fontSize >= 8 && fontSize <= 256
      ? changed({ ...defaults, fontSize }, { fontSize })
      : { kind: 'handled' }
  }
  if (id === 'textBold') {
    const weight: TextToolDefaults['weight'] = value === 'true' ? 700 : 400
    return changed({ ...defaults, weight }, { weight })
  }
  if (id === 'textItalic' || id === 'textStrikethrough') {
    const enabled = value === 'true'
    return id === 'textItalic'
      ? changed({ ...defaults, italic: enabled }, { italic: enabled })
      : changed(
          { ...defaults, strikethrough: enabled },
          { strikethrough: enabled },
        )
  }
  return { kind: 'unhandled' }
}

function resolveParagraphChange(
  id: string,
  value: string,
  defaults: TextToolDefaults,
): ResolvedTextChange {
  if (id === 'textList') {
    return value === 'none' || value === 'bullet'
      ? changed({ ...defaults, listKind: value }, {}, { listKind: value })
      : { kind: 'handled' }
  }
  if (id === 'textAlign') {
    return value === 'start' || value === 'center' || value === 'end'
      ? changed({ ...defaults, alignment: value }, {}, { alignment: value })
      : { kind: 'handled' }
  }
  return { kind: 'unhandled' }
}

function parseBackground(value: string): TextBackground | null | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    console.warn('cute-screen text background draft is invalid', error)
    return undefined
  }
  if (parsed === null) return null
  if (typeof parsed !== 'object') return undefined
  const draft = parsed as {
    color?: unknown
    padding?: unknown
    radius?: unknown
  }
  const color =
    typeof draft.color === 'string' ? parseHexColor(draft.color) : undefined
  const padding = Number(draft.padding)
  const radius = Number(draft.radius)
  if (
    !color ||
    !Number.isInteger(padding) ||
    !Number.isInteger(radius) ||
    padding < 0 ||
    padding > 256 ||
    radius < 0 ||
    radius > 256
  ) {
    return undefined
  }
  return { color, padding, radius }
}

function resolveTextChange(
  id: string,
  value: string,
  defaults: TextToolDefaults,
): ResolvedTextChange {
  const span = resolveSpanChange(id, value, defaults)
  if (span.kind !== 'unhandled') return span
  const paragraph = resolveParagraphChange(id, value, defaults)
  if (paragraph.kind !== 'unhandled') return paragraph
  if (id !== 'textBackground') return { kind: 'unhandled' }
  const background = parseBackground(value)
  return background === undefined
    ? { kind: 'handled' }
    : changed({ ...defaults, background }, {}, {}, background)
}

function updatedTextLayer(
  layer: TextLayer,
  content: ReturnType<typeof applyRichTextParagraphStyle>['content'],
  background: TextBackground | null | undefined,
): TextLayer {
  if (layer.kind === 'text') {
    return {
      ...layer,
      payload: {
        ...layer.payload,
        content,
        ...(background === undefined ? {} : { background }),
      },
    }
  }
  if (layer.kind === 'callout') {
    return {
      ...layer,
      payload: {
        ...layer.payload,
        content,
        ...(background === undefined
          ? {}
          : { background: background ?? layer.payload.background }),
      },
    }
  }
  return {
    ...layer,
    payload: {
      ...layer.payload,
      label: content,
      ...(background === undefined
        ? {}
        : {
            badge: {
              ...layer.payload.badge,
              color: background?.color ?? layer.payload.badge.color,
            },
          }),
    },
  }
}

function updateWholeTextLayer(
  context: TextEffectsContext,
  change: TextChange,
): void {
  const layer = selectedTextLayer(context)
  if (
    !layer ||
    layer.locked ||
    !context.props.documentSession ||
    context.textDraft.value
  ) {
    return
  }
  const content =
    layer.kind === 'numberedMarker'
      ? layer.payload.label
      : layer.payload.content
  const firstSpan = content.spans[0]
  const firstParagraph = content.paragraphs[0]
  if (!firstSpan || !firstParagraph) return
  const styled = applyRichTextSpanStyle(
    {
      content,
      selection: { anchor: 0, focus: content.text.length },
      typingStyle: firstSpan,
      paragraphStyle: firstParagraph,
    },
    change.span,
  )
  const formatted = applyRichTextParagraphStyle(styled, change.paragraph)
  context.props.documentSession.execute({
    type: 'updateLayer',
    before: layer,
    after: updatedTextLayer(layer, formatted.content, change.background),
  })
}

function applyCalloutStrokeChange(
  context: TextEffectsContext,
  id: string,
  value: string,
): boolean {
  if (id !== 'color' && id !== 'stroke') return false
  const selected = context.activeDocument.value?.layers.find(
    (layer) => layer.id === context.store.selectedLayerId,
  )
  if (
    selected?.kind !== 'callout' ||
    selected.locked ||
    !context.props.documentSession
  ) {
    return false
  }
  let stroke = selected.payload.stroke
  if (id === 'color') {
    const color = parseHexColor(value)
    if (!color) return true
    stroke = { ...stroke, color }
  } else {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch (error) {
      console.warn('cute-screen callout stroke draft is invalid', error)
      return true
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return true
    const draft = parsed as { width?: unknown; style?: unknown }
    const width = Number(draft.width)
    const style = draft.style
    if (
      !Number.isFinite(width) ||
      width < 1 ||
      width > 24 ||
      (style !== 'solid' && style !== 'dashed' && style !== 'dotted')
    ) {
      return true
    }
    stroke = { ...stroke, width, style }
  }
  context.props.documentSession.execute({
    type: 'updateLayer',
    before: selected,
    after: rebaseCalloutLayer(selected, { ...selected.payload, stroke }),
  })
  return true
}

export function createTextEffects(context: TextEffectsContext) {
  let revision = 0
  function applyV7TextChange(id: string, value: string): boolean {
    const resolved = resolveTextChange(id, value, context.textDefaults.value)
    if (resolved.kind === 'unhandled') return false
    if (resolved.kind === 'handled') return true
    const change = resolved.change
    context.textDefaults.value = change.defaults
    if (context.textDraft.value) {
      context.textFormatting.value = {
        revision: ++revision,
        ...(Object.keys(change.span).length > 0 ? { span: change.span } : {}),
        ...(Object.keys(change.paragraph).length > 0
          ? { paragraph: change.paragraph }
          : {}),
        ...(change.background === undefined
          ? {}
          : { background: change.background }),
      }
    } else {
      updateWholeTextLayer(context, change)
    }
    return true
  }
  return {
    applyV7TextChange,
    applyCalloutStrokeChange: (id: string, value: string) =>
      applyCalloutStrokeChange(context, id, value),
  }
}
