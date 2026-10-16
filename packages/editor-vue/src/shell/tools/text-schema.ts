import {
  numberedMarkerCaption,
  measureRichTextContent,
} from '@cute-screen/editor-renderer'
import { TEXT_FONT_FAMILIES } from '../../text-fonts'
import {
  computed,
  type Ref,
  type ShallowRef,
} from 'vue'
import { nextNumberedMarkerSequence } from '@cute-screen/editor-renderer'
import type {
  EditorDocumentV1,
  LayerNode,
  RichTextContent,
  SrgbColor,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../contracts'
import type {
  TextToolDefaults,
  TextToolbarSnapshot,
} from '../canvas/contracts'
import type { ContextToolbarSchema } from '../types'

type TextKind = 'text' | 'callout' | 'numberedMarker'
type TextLayer = Extract<LayerNode, { readonly kind: TextKind }>

export interface TextDraft {
  readonly id: string
  readonly kind: TextKind
  readonly snapshot: TextToolbarSnapshot
}

export interface TextSchemaContext {
  readonly recentColors?: Ref<readonly SrgbColor[]>
  readonly markerShape?: Ref<'circle' | 'square' | 'diamond' | 'star'>
  readonly markerNextOverride?: Ref<number | undefined>
  readonly calloutStroke?: Ref<import('@cute-screen/editor-renderer').StrokeStyle>
  readonly props: ResolvedEditorShellProps
  readonly store: {
    readonly selectedLayerIds: readonly string[]
    readonly selectedLayerId: string | undefined
  }
  readonly activeToolId: Ref<string | undefined>
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly textDefaults: ShallowRef<TextToolDefaults>
  readonly textDraft: Ref<TextDraft | undefined>
  readonly translate: (key: Parameters<typeof import('../i18n').t>[1]) => string
  readonly hexColor: (value: unknown) => string
}

function isTextLayer(layer: LayerNode | undefined): layer is TextLayer {
  return layer?.kind === 'text' || layer?.kind === 'callout' || layer?.kind === 'numberedMarker'
}

function textKindFor(
  context: TextSchemaContext,
  selected: TextLayer | undefined,
  tool: string,
): TextKind | undefined {
  if (context.textDraft.value) return context.textDraft.value.kind
  if (selected) return selected.kind
  return tool === 'text' || tool === 'callout' || tool === 'numberedMarker' ? tool : undefined
}

function sameValue<T>(
  values: readonly T[],
  fallback: T,
): T | null {
  return values.length === 0 || values.every((value) => value === values[0]) ? (values[0] ?? fallback) : null
}

function sameColor(
  values: readonly SrgbColor[],
  fallback: SrgbColor,
): SrgbColor | null {
  const first = values[0]
  if (!first) return fallback
  return values.every(
    (color) =>
      color.red === first.red &&
      color.green === first.green &&
      color.blue === first.blue &&
      color.alpha === first.alpha,
  )
    ? first
    : null
}

function contentFor(layer: TextLayer | undefined): RichTextContent | undefined {
  if (!layer) return undefined
  if (layer.kind !== 'numberedMarker') return layer.payload.content
  const caption = numberedMarkerCaption(layer)
  return caption.text ? caption : layer.payload.label
}

function backgroundFor(
  context: TextSchemaContext,
  selected: TextLayer | undefined,
) {
  if (selected?.kind === 'text' || selected?.kind === 'callout') {
    return selected.payload.background
  }
  if (selected?.kind === 'numberedMarker') {
    return { color: selected.payload.badge.color, padding: 0, radius: 0 }
  }
  return context.textDefaults.value.background
}

function markerMetadata(
  context: TextSchemaContext,
  selected: TextLayer | undefined,
  background: ReturnType<typeof backgroundFor>,
): NonNullable<NonNullable<ContextToolbarSchema['text']>['marker']> {
  const snapshot = context.textDraft.value?.snapshot
  const marker = selected?.kind === 'numberedMarker' ? selected : undefined
  const sequence = marker?.payload.sequence ?? context.markerNextOverride?.value ??
    nextNumberedMarkerSequence(context.activeDocument.value?.layers ?? [])
  return {
    recentColors: context.recentColors?.value ?? [],
    mode: snapshot ? 'inline' as const : marker ? 'selection' as const : 'defaults' as const,
    sequence,
    shape: marker?.payload.badge.shape ?? context.markerShape?.value ?? 'circle',
    badgeColor: background ? context.hexColor(background.color) : '#000000',
    customLabel: Boolean(marker && numberedMarkerCaption(marker).text),
    duplicate: Boolean(context.activeDocument.value?.layers.some((layer) =>
      layer.kind === 'numberedMarker' && layer.id !== marker?.id && layer.payload.sequence === sequence)),
    manual: context.markerNextOverride?.value !== undefined,
  }
}

function calloutWidthSnapshot(
  snapshot: TextToolbarSnapshot | undefined,
  selected: TextLayer | undefined,
) {
  if (snapshot?.calloutWidth) return snapshot.calloutWidth
  if (selected?.kind !== 'callout') return undefined
  return {
    mode: selected.payload.content.wrap,
    value: measureRichTextContent(selected.payload.content).width,
    minimum: Math.max(1, ...selected.payload.content.spans.map((span) => span.fontSize)),
  }
}

function textToolbar(
  context: TextSchemaContext,
  selected: TextLayer | undefined,
  kind: TextKind,
): NonNullable<ContextToolbarSchema['text']> {
  const snapshot = context.textDraft.value?.snapshot
  const content = contentFor(selected)
  const spans = content?.spans ?? []
  const paragraphs = content?.paragraphs ?? []
  const defaults = context.textDefaults.value
  const selectedColor = sameColor(
    spans.map((span) => span.color),
    defaults.color,
  )
  const background = snapshot ? snapshot.background : backgroundFor(context, selected)
  return {
    kind,
    ...(kind === 'numberedMarker' ? { marker: markerMetadata(context, selected, background) } : {}),
    calloutWidth: calloutWidthSnapshot(snapshot, selected),
    color: snapshot
      ? snapshot.color
        ? context.hexColor(snapshot.color)
        : null
      : selectedColor
        ? context.hexColor(selectedColor)
        : null,
    fontFamily: snapshot
      ? snapshot.fontFamily
      : sameValue(
          spans.map((span) => span.fontFamily),
          defaults.fontFamily,
        ),
    fonts: TEXT_FONT_FAMILIES,
    fontPreviewText: snapshot?.fontPreviewText ?? content?.text,
    fontSize: snapshot
      ? snapshot.fontSize
      : sameValue(
          spans.map((span) => span.fontSize),
          defaults.fontSize,
        ),
    bold:
      snapshot?.weight === null
        ? null
        : snapshot?.weight !== undefined
          ? snapshot.weight >= 700
          : sameValue(
              spans.map((span) => span.weight >= 700),
              defaults.weight >= 700,
            ),
    italic: snapshot
      ? snapshot.italic
      : sameValue(
          spans.map((span) => span.italic),
          defaults.italic,
        ),
    strikethrough: snapshot
      ? snapshot.strikethrough
      : sameValue(
          spans.map((span) => span.strikethrough),
          defaults.strikethrough,
        ),
    listKind: snapshot
      ? snapshot.listKind
      : sameValue(
          paragraphs.map((paragraph) => paragraph.listKind),
          defaults.listKind,
        ),
    alignment: snapshot
      ? snapshot.alignment
      : sameValue(
          paragraphs.map((paragraph) => paragraph.alignment),
          defaults.alignment,
        ),
    background: background
      ? {
          color: context.hexColor(background.color),
          padding: background.padding,
          radius: background.radius,
        }
      : null,
    disabled: kind === 'numberedMarker' ? (['list', 'none', 'padding', 'radius'] as const) : [],
  }
}

function calloutControls(
  context: TextSchemaContext,
  selected: TextLayer | undefined,
): ContextToolbarSchema['controls'] {
  const stroke = selected?.kind === 'callout' ? selected.payload.stroke : context.calloutStroke?.value
  if (!stroke) return []
  const disabled = context.props.readOnlyDocument || Boolean(selected?.locked)
  return [
    {
      kind: 'color',
      id: 'color',
      label: context.translate('color'),
      value: context.hexColor(stroke.color),
      compact: true,
      disabled,
      eyedropper: Boolean(context.activeDocument.value) && !disabled,
    },
    {
      kind: 'arrowStroke',
      id: 'stroke',
      label: context.translate('arrowStroke'),
      width: stroke.width,
      style: stroke.style === 'solid' || stroke.style === 'dotted' ? stroke.style : 'dashed',
      disabled,
      solidLabel: context.translate('arrowSolid'),
      dashedLabel: context.translate('arrowDashed'),
      dottedLabel: context.translate('arrowDotted'),
    },
  ]
}

function titleFor(
  context: TextSchemaContext,
  kind: TextKind,
): string {
  return context.translate(
    kind === 'callout' ? 'toolCallout' : kind === 'numberedMarker' ? 'toolNumberedMarker' : 'toolText',
  )
}

function buildTextContextSchema(
  context: TextSchemaContext,
  selectedCandidate: LayerNode | undefined,
  tool: string,
): ContextToolbarSchema | undefined {
  const selected = isTextLayer(selectedCandidate) ? selectedCandidate : undefined
  const kind = textKindFor(context, selected, tool)
  if (!kind) return undefined
  return {
    icon: kind,
    title: titleFor(context, kind),
    hint: context.translate('canvasViewport'),
    controls: kind === 'callout' ? calloutControls(context, selected) : [],
    text: textToolbar(context, selected, kind),
  }
}

function selectedLayer(context: TextSchemaContext): LayerNode | undefined {
  if (context.store.selectedLayerIds.length !== 1) return undefined
  return context.activeDocument.value?.layers.find((layer) => layer.id === context.store.selectedLayerId)
}

export function createTextSchema(context: TextSchemaContext) {
  const floatingTextToolbarSchema = computed(() => {
    if (!context.textDraft.value) return undefined
    const schema = buildTextContextSchema(context, selectedLayer(context), context.activeToolId.value ?? 'select')
    if (!schema?.text) return undefined
    return { text: schema.text, title: schema.title }
  })
  return {
    buildTextContextSchema: (selected: LayerNode | undefined, tool: string, defaultsOnly = false) =>
      buildTextContextSchema(
        defaultsOnly ? { ...context, textDraft: computed(() => undefined) } : context,
        selected,
        tool,
      ),
    floatingTextToolbarSchema,
  }
}
