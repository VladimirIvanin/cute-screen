import { markRaw, nextTick } from 'vue'
import {
  createCalloutLayer,
  createTextCommitCommand,
  createTextLayer,
  hitTestDocumentAll,
  rebaseCalloutLayer,
  type RichTextContent,
  type RichTextSpanStyle,
  type StrokeStyle,
  type TextBackground,
} from '@cute-screen/editor-renderer'
import {
  RichTextEditorController,
  readRichTextDomSelection,
  readRichTextProjection,
  renderRichTextProjection,
  restoreRichTextDomSelection,
} from '../../rich-text-editor'
import type {
  CanvasPoint,
  CanvasViewportProps,
  CanvasViewportEmit,
} from './contracts'
import { isFloatingToolbarTarget } from './floating-toolbar-controller'
import {
  DEFAULT_TEXT_TOOL,
  type EditableTextLayer,
  type createCanvasWorkspaceState,
} from './workspace-state'
import {
  copyTextStyle,
  paragraphStyleFromDefaults,
  spanStyleFromDefaults,
} from './text-formatting-controller'

type WorkspaceState = ReturnType<typeof createCanvasWorkspaceState>

export interface TextEditorStartInput {
  readonly origin: CanvasPoint
  readonly existing?: EditableTextLayer
  readonly kind?: 'text' | 'callout'
  readonly width?: number
  readonly fixedWidth?: boolean
  readonly calloutDraft?: {
    readonly target: CanvasPoint
    readonly label: CanvasPoint
  }
  readonly calloutStroke?: StrokeStyle
}

export interface TextEditorContext {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly editingText: WorkspaceState['editingText']
  readonly floatingToolbarLayout: WorkspaceState['floatingToolbarLayout']
  readonly textEditor: WorkspaceState['textEditor']
  readonly layerBounds: (layer: EditableTextLayer) => {
    x: number
    y: number
    width: number
    height: number
  }
  readonly canvasPoint: (event: {
    readonly clientX: number
    readonly clientY: number
  }) => CanvasPoint | undefined
  readonly resolveCalloutStroke: () => StrokeStyle
  readonly updateToolbarLayout: () => void
  readonly emitEditing: () => void
  readonly recordCycle: (cycle: {
    readonly key: string
    readonly at: number
    readonly index: number
  }) => void
}

export class TextEditorController {
  readonly #context: TextEditorContext
  #toolbarPointerDown = false

  constructor(context: TextEditorContext) {
    this.#context = context
  }

  start(input: TextEditorStartInput): void {
    const { props, editingText } = this.#context
    const bounds = input.existing
      ? this.#context.layerBounds(input.existing)
      : undefined
    const defaults = copyTextStyle(props.textDefaults ?? DEFAULT_TEXT_TOOL)
    const fixedWidth =
      input.fixedWidth ??
      (input.existing?.kind === 'text'
        ? input.existing.payload.content.wrap === 'fixedWidth'
        : false)
    const existingContent =
      input.existing?.kind === 'numberedMarker'
        ? input.existing.payload.label
        : input.existing?.payload.content
    const initialContent = this.#initialContent(
      existingContent,
      fixedWidth,
      input.width,
    )
    editingText.value = {
      id: input.existing?.id ?? crypto.randomUUID(),
      origin: input.origin,
      width: input.width ?? bounds?.width ?? this.#defaultWidth(),
      fixedWidth,
      controller: markRaw(
        new RichTextEditorController(
          initialContent,
          {
            anchor: initialContent.text.length,
            focus: initialContent.text.length,
          },
          {
            typingStyle: spanStyleFromDefaults(defaults),
            paragraphStyle: paragraphStyleFromDefaults(defaults),
          },
        ),
      ),
      background: this.#initialBackground(input.existing, defaults.background),
      kind: input.existing?.kind ?? input.kind ?? 'text',
      ...(input.existing === undefined ? {} : { existing: input.existing }),
      ...(input.calloutDraft === undefined
        ? {}
        : { calloutDraft: input.calloutDraft }),
      ...(input.calloutStroke === undefined
        ? {}
        : { calloutStroke: input.calloutStroke }),
    }
    this.#context.emitEditing()
    void nextTick(() => this.#focus())
  }

  syncSelection(): void {
    const { textEditor, editingText } = this.#context
    const editor = textEditor.value
    const editing = editingText.value
    if (!editor || !editing) return
    editing.controller.setSelection(readRichTextDomSelection(editor))
    this.#context.emitEditing()
    void nextTick(this.#context.updateToolbarLayout)
  }

  renderProjection(): void {
    const { textEditor, editingText, props } = this.#context
    const editor = textEditor.value
    const editing = editingText.value
    if (!editor || !editing) return
    renderRichTextProjection(
      editor,
      editing.controller.state,
      (props.zoom ?? 100) / 100,
    )
    restoreRichTextDomSelection(editor, editing.controller.state.selection)
    void nextTick(this.#context.updateToolbarLayout)
  }

  input(): void {
    const { editingText, textEditor } = this.#context
    const editing = editingText.value
    const editor = textEditor.value
    if (!editing || !editor) return
    const result = editing.controller.reconcileBrowserText(
      this.#readText(),
      readRichTextDomSelection(editor),
    )
    if (result === 'applied') this.renderProjection()
    this.#context.emitEditing()
  }

  compositionStart(): void {
    this.#context.editingText.value?.controller.compositionStart()
  }

  compositionEnd(): void {
    const { editingText, textEditor } = this.#context
    const editing = editingText.value
    const editor = textEditor.value
    if (!editing || !editor) return
    editing.controller.compositionEnd(
      this.#readText(),
      readRichTextDomSelection(editor),
    )
    this.renderProjection()
    this.#context.emitEditing()
  }

  paste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain')
    if (text === undefined) return
    event.preventDefault()
    this.syncSelection()
    this.#context.editingText.value?.controller.replaceSelectionPlainText(text)
    this.renderProjection()
    this.#context.emitEditing()
  }

  copy(event: ClipboardEvent): void {
    const editing = this.#context.editingText.value
    if (!editing || !event.clipboardData) return
    this.syncSelection()
    event.preventDefault()
    event.clipboardData.clearData()
    event.clipboardData.setData(
      'text/plain',
      editing.controller.selectedPlainText(),
    )
  }

  cut(event: ClipboardEvent): void {
    const editing = this.#context.editingText.value
    if (!editing || !event.clipboardData) return
    this.copy(event)
    editing.controller.replaceSelectionPlainText('')
    this.renderProjection()
    this.#context.emitEditing()
  }

  blur(event: FocusEvent): void {
    const movedIntoToolbar =
      this.#toolbarPointerDown || isFloatingToolbarTarget(event.relatedTarget)
    window.setTimeout(() => {
      if (!this.#context.editingText.value) return
      const active = document.activeElement
      if (movedIntoToolbar || isFloatingToolbarTarget(active)) return
      this.commit()
    }, 0)
  }

  documentPointerDown(event: PointerEvent): void {
    this.#toolbarPointerDown = isFloatingToolbarTarget(event.target)
    window.setTimeout(() => {
      this.#toolbarPointerDown = false
    }, 0)
  }

  commit(): void {
    const { editingText, floatingToolbarLayout, props, emit } = this.#context
    const editing = editingText.value
    if (!editing || editing.controller.composing) return
    editingText.value = undefined
    floatingToolbarLayout.value = undefined
    this.#context.emitEditing()
    const content = editing.controller.state.content
    const style = content.spans[0] ?? editing.controller.state.typingStyle
    const paragraph =
      content.paragraphs[0] ?? editing.controller.state.paragraphStyle
    const existing = editing.existing
    if (content.text.length === 0) {
      if (!existing) return
      const index = props.document?.layers.findIndex(
        (layer) => layer.id === existing.id,
      )
      if (index === undefined || index < 0) return
      emit(
        'documentCommand',
        createTextCommitCommand({ existing, next: null, index }),
      )
      return
    }
    const next = this.#committedLayer(editing, style, paragraph.alignment)
    if (!next) return
    emit(
      'documentCommand',
      createTextCommitCommand(existing ? { existing, next } : { next }),
    )
  }

  cancel(): void {
    this.#context.editingText.value = undefined
    this.#context.floatingToolbarLayout.value = undefined
    this.#context.emitEditing()
    this.#context.emit('textEditingCancelled', 'escape')
  }

  keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.cancel()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      this.commit()
      return
    }
    if (event.key !== 'Enter' && event.key !== 'Backspace') return
    this.syncSelection()
    if (this.#context.editingText.value?.controller.keydown(event.key)) {
      event.preventDefault()
      event.stopPropagation()
      this.renderProjection()
      this.#context.emitEditing()
    }
  }

  beforeInput(event: InputEvent): void {
    if (this.#context.editingText.value?.controller.composing) return
    const key =
      event.inputType === 'insertParagraph' ||
      event.inputType === 'insertLineBreak'
        ? 'Enter'
        : event.inputType === 'deleteContentBackward'
          ? 'Backspace'
          : undefined
    if (!key) return
    this.syncSelection()
    if (this.#context.editingText.value?.controller.keydown(key)) {
      event.preventDefault()
      this.renderProjection()
      this.#context.emitEditing()
    }
  }

  doubleClick(event: MouseEvent): void {
    const { props, emit } = this.#context
    const point = this.#context.canvasPoint(event)
    if (!point || !props.document) return
    const hits = hitTestDocumentAll(props.document, point)
    const text = props.document.layers.find(
      (layer) =>
        layer.id === hits[0]?.nodeId &&
        (layer.kind === 'text' ||
          layer.kind === 'callout' ||
          layer.kind === 'numberedMarker'),
    )
    if (
      text?.kind === 'text' ||
      text?.kind === 'callout' ||
      text?.kind === 'numberedMarker'
    ) {
      event.preventDefault()
      const bounds = this.#context.layerBounds(text)
      this.start({
        origin: {
          x: text.transform.translateX + bounds.x,
          y: text.transform.translateY + bounds.y,
        },
        existing: text,
        kind: 'text',
      })
      return
    }
    if (hits.length < 2) return
    const key = hits.map((hit) => hit.nodeId).join(':')
    const current = hits.findIndex(
      (hit) => hit.nodeId === props.selectedLayerId,
    )
    const index = current < 0 ? 0 : (current + 1) % hits.length
    this.#context.recordCycle({ key, at: performance.now(), index })
    emit('selectLayer', hits[index]!.nodeId, event.metaKey || event.ctrlKey)
  }

  documentSelectionChange(): void {
    const editor = this.#context.textEditor.value
    const selection = window.getSelection()
    if (
      editor &&
      selection?.anchorNode &&
      selection.focusNode &&
      editor.contains(selection.anchorNode) &&
      editor.contains(selection.focusNode)
    ) {
      this.syncSelection()
    }
  }

  #defaultWidth(): number {
    return Math.max(
      160,
      this.#context.props.canvas?.width
        ? this.#context.props.canvas.width / 3
        : 160,
    )
  }

  #initialContent(
    existing: RichTextContent | undefined,
    fixedWidth: boolean,
    width: number | undefined,
  ): RichTextContent {
    return (
      existing ??
      Object.freeze({
        text: '',
        wrap: fixedWidth ? ('fixedWidth' as const) : ('autoSize' as const),
        ...(fixedWidth ? { fixedWidth: width ?? this.#defaultWidth() } : {}),
        spans: Object.freeze([]),
        paragraphs: Object.freeze([]),
      })
    )
  }

  #initialBackground(
    existing: EditableTextLayer | undefined,
    fallback: TextBackground | null,
  ) {
    if (existing?.kind === 'text' || existing?.kind === 'callout') {
      return existing.payload.background
    }
    if (existing?.kind === 'numberedMarker') {
      return { color: existing.payload.badge.color, padding: 0, radius: 0 }
    }
    return fallback
  }

  #committedLayer(
    editing: NonNullable<WorkspaceState['editingText']['value']>,
    style: RichTextSpanStyle,
    alignment: import('@cute-screen/editor-renderer').RichTextParagraphStyle['alignment'],
  ): EditableTextLayer | null {
    const existing = editing.existing
    const content = editing.controller.state.content
    if (existing?.kind === 'numberedMarker') {
      return {
        ...existing,
        payload: {
          ...existing.payload,
          label: content,
          badge: editing.background
            ? { ...existing.payload.badge, color: editing.background.color }
            : existing.payload.badge,
        },
      }
    }
    if (existing?.kind === 'callout') {
      return rebaseCalloutLayer(existing, {
        ...existing.payload,
        content,
        background: editing.background ?? existing.payload.background,
      })
    }
    if (editing.kind === 'callout') {
      return this.#createCallout(editing, style)
    }
    const draft = createTextLayer({
      id: editing.id,
      text: content.text,
      origin: existing
        ? {
            x: existing.transform.translateX,
            y: existing.transform.translateY,
          }
        : editing.origin,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      weight: style.weight,
      italic: style.italic,
      strikethrough: style.strikethrough,
      alignment,
      listKind:
        content.paragraphs[0]?.listKind ??
        editing.controller.state.paragraphStyle.listKind,
      ...(editing.fixedWidth ? { fixedWidth: editing.width } : {}),
      color: style.color,
      background: editing.background,
    })
    if (!draft) return null
    return {
      ...draft,
      ...(existing ? { id: existing.id, transform: existing.transform } : {}),
      payload: { ...draft.payload, content },
    }
  }

  #createCallout(
    editing: NonNullable<WorkspaceState['editingText']['value']>,
    style: RichTextSpanStyle,
  ): EditableTextLayer | null {
    const draft = editing.calloutDraft
    if (!draft) return null
    const layer = createCalloutLayer({
      id: editing.id,
      text: editing.controller.state.content.text,
      target: draft.target,
      label: draft.label,
      fontFamily: style.fontFamily,
      color: style.color,
      background: editing.background,
      stroke: editing.calloutStroke ?? this.#context.resolveCalloutStroke(),
    })
    return layer
      ? {
          ...layer,
          payload: {
            ...layer.payload,
            content: editing.controller.state.content,
          },
        }
      : null
  }

  #focus(): void {
    const editor = this.#context.textEditor.value
    if (!editor || !this.#context.editingText.value) return
    editor.focus()
    this.renderProjection()
    void nextTick(this.#context.updateToolbarLayout)
  }

  #readText(): string {
    const editor = this.#context.textEditor.value
    if (!editor) {
      return (
        this.#context.editingText.value?.controller.state.content.text ?? ''
      )
    }
    return readRichTextProjection(editor)
  }
}
