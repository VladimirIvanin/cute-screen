import { computed, nextTick, watch } from 'vue'
import {
  richTextSelectionRange,
  type RichTextParagraphStyle,
  type RichTextSpanStyle,
  type SrgbColor,
  type TextBackground,
} from '@cute-screen/editor-renderer'
import type {
  CanvasViewportProps,
  TextToolbarSnapshot,
  TextToolDefaults,
} from './contracts'
import type { CanvasViewportEmit } from './contracts'
import {
  DEFAULT_TEXT_TOOL,
  type createCanvasWorkspaceState,
} from './workspace-state'

type EditingText = ReturnType<typeof createCanvasWorkspaceState>['editingText']

export function cssTextColor(color: SrgbColor): string {
  return `rgba(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)}, ${color.alpha})`
}

export function cssTextBackground(
  background: TextBackground | null,
): string | undefined {
  return background ? cssTextColor(background.color) : undefined
}

export function copyTextStyle(value: TextToolDefaults): TextToolDefaults {
  return JSON.parse(JSON.stringify(value)) as TextToolDefaults
}

export function spanStyleFromDefaults(
  defaults: TextToolDefaults,
): RichTextSpanStyle {
  return {
    fontFamily: defaults.fontFamily,
    fontSize: defaults.fontSize,
    color: defaults.color,
    weight: defaults.weight,
    italic: defaults.italic,
    strikethrough: defaults.strikethrough,
  }
}

export function paragraphStyleFromDefaults(
  defaults: TextToolDefaults,
): RichTextParagraphStyle {
  return { alignment: defaults.alignment, listKind: defaults.listKind }
}

function common<T>(
  values: readonly T[],
  equal: (left: T, right: T) => boolean,
): T | null {
  const first = values[0]
  return first !== undefined && values.every((value) => equal(first, value))
    ? first
    : null
}

function toolbarSnapshot(editing: NonNullable<EditingText['value']>) {
  const state = editing.controller.state
  const range = richTextSelectionRange(state.selection)
  const spans =
    range.start === range.end
      ? [state.typingStyle]
      : state.content.spans.filter(
          (span) => span.start < range.end && span.end > range.start,
        )
  const paragraphs =
    range.start === range.end
      ? [state.paragraphStyle]
      : state.content.paragraphs.filter(
          (paragraph) =>
            paragraph.start < range.end && paragraph.end > range.start,
        )
  const sameColor = (left: SrgbColor, right: SrgbColor) =>
    left.red === right.red &&
    left.green === right.green &&
    left.blue === right.blue &&
    left.alpha === right.alpha
  return Object.freeze<TextToolbarSnapshot>({
    fontFamily: common(
      spans.map((span) => span.fontFamily),
      (a, b) => a === b,
    ),
    fontSize: common(
      spans.map((span) => span.fontSize),
      (a, b) => a === b,
    ),
    color: common(
      spans.map((span) => span.color),
      sameColor,
    ),
    weight: common(
      spans.map((span) => span.weight),
      (a, b) => a === b,
    ),
    italic: common(
      spans.map((span) => span.italic),
      (a, b) => a === b,
    ),
    strikethrough: common(
      spans.map((span) => span.strikethrough),
      (a, b) => a === b,
    ),
    alignment: common(
      paragraphs.map((paragraph) => paragraph.alignment),
      (a, b) => a === b,
    ),
    listKind: common(
      paragraphs.map((paragraph) => paragraph.listKind),
      (a, b) => a === b,
    ),
    background: editing.background,
  })
}

export interface TextFormattingContext {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly editingText: EditingText
  readonly renderProjection: () => void
  readonly updateTextToolbarLayout: () => void
  readonly updateArrowToolbarLayout: () => void
}

function registerFormattingWatches(context: TextFormattingContext): void {
  watch(
    () => context.props.textFormatting,
    (patch) => {
      const editing = context.editingText.value
      if (!editing || !patch) return
      if (patch.span) editing.controller.applySpanStyle(patch.span)
      if (patch.paragraph) {
        editing.controller.applyParagraphStyle(patch.paragraph)
      }
      if (patch.background !== undefined) editing.background = patch.background
      context.renderProjection()
      emitTextEditing(context)
    },
  )
  watch(
    () => context.props.zoom,
    () => {
      if (!context.editingText.value) return
      void nextTick(() => {
        context.renderProjection()
        context.updateTextToolbarLayout()
      })
    },
  )
  watch(
    () => context.props.textToolbarSchema,
    () => {
      if (context.editingText.value) {
        void nextTick(context.updateTextToolbarLayout)
      }
    },
  )
  watch(
    () => [
      context.props.selectedLayerId,
      context.props.selectedLayerIds,
      context.props.arrowToolbarSchema,
      context.props.zoom,
    ],
    () => void nextTick(context.updateArrowToolbarLayout),
    { immediate: true },
  )
}

function emitTextEditing(context: TextFormattingContext): void {
  const editing = context.editingText.value
  context.emit(
    'textEditing',
    editing
      ? {
          id: editing.id,
          kind: editing.kind,
          snapshot: toolbarSnapshot(editing),
        }
      : undefined,
  )
}

export function createTextFormattingController(context: TextFormattingContext) {
  registerFormattingWatches(context)
  return {
    editorTextStyle: computed(
      () =>
        context.editingText.value?.controller.state.typingStyle ??
        context.props.textDefaults ??
        DEFAULT_TEXT_TOOL,
    ),
    emitTextEditing: () => emitTextEditing(context),
  }
}
