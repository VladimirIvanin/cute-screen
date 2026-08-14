import {
  applyRichTextParagraphStyle,
  applyRichTextSpanStyle,
  createRichTextEditingState,
  handleRichTextBackspace,
  handleRichTextEnter,
  reconcileRichTextText,
  replaceRichTextSelection,
  richTextSelectionRange,
  setRichTextSelection,
  type RichTextContent,
  type RichTextEditingState,
  type RichTextParagraph,
  type RichTextParagraphStyle,
  type RichTextSelection,
  type RichTextSpanStyle,
} from '@cute-screen/editor-renderer'

export type BrowserTextReconcileResult = 'applied' | 'unchanged' | 'deferred'

function sameContent(left: RichTextContent, right: RichTextContent): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Owns one transient text-edit draft. It never emits document commands; the
 * CanvasViewport converts the final draft into one command at the session edge.
 */
export class RichTextEditorController {
  #state: RichTextEditingState
  #composing = false
  #revision = 0

  constructor(
    content: RichTextContent,
    selection?: RichTextSelection,
    defaults?: Readonly<{
      readonly typingStyle?: RichTextSpanStyle
      readonly paragraphStyle?: RichTextParagraphStyle
    }>,
  ) {
    this.#state = createRichTextEditingState(content, selection, defaults)
  }

  get state(): RichTextEditingState {
    return this.#state
  }

  get composing(): boolean {
    return this.#composing
  }

  get revision(): number {
    return this.#revision
  }

  setSelection(selection: RichTextSelection): void {
    const next = setRichTextSelection(this.#state, selection)
    this.#state =
      next.selection.anchor === this.#state.selection.anchor &&
      next.selection.focus === this.#state.selection.focus
        ? Object.freeze({
            ...next,
            typingStyle: this.#state.typingStyle,
            paragraphStyle: this.#state.paragraphStyle,
          })
        : next
  }

  applySpanStyle(patch: Partial<RichTextSpanStyle>): void {
    this.#replaceState(applyRichTextSpanStyle(this.#state, patch), true)
  }

  applyParagraphStyle(patch: Partial<RichTextParagraphStyle>): void {
    this.#replaceState(applyRichTextParagraphStyle(this.#state, patch), true)
  }

  replaceSelectionPlainText(text: string): void {
    this.#replaceState(
      replaceRichTextSelection(this.#state, text.replace(/\r\n?/gu, '\n')),
      true,
    )
  }

  selectedPlainText(): string {
    const range = richTextSelectionRange(this.#state.selection)
    return this.#state.content.text.slice(range.start, range.end)
  }

  compositionStart(): void {
    this.#composing = true
  }

  reconcileBrowserText(
    text: string,
    selection: RichTextSelection,
  ): BrowserTextReconcileResult {
    if (this.#composing) return 'deferred'
    const normalizedText = text.replace(/\r\n?/gu, '\n')
    const next = reconcileRichTextText(this.#state, normalizedText, selection)
    if (sameContent(this.#state.content, next.content)) {
      this.#state = next
      return 'unchanged'
    }
    this.#state = next
    this.#revision += 1
    return 'applied'
  }

  compositionEnd(text: string, selection: RichTextSelection): void {
    this.#composing = false
    this.reconcileBrowserText(text, selection)
  }

  keydown(key: 'Enter' | 'Backspace'): boolean {
    if (this.#composing) return false
    if (key === 'Enter') {
      this.#replaceState(handleRichTextEnter(this.#state), true)
      return true
    }
    const result = handleRichTextBackspace(this.#state)
    if (result.handled) this.#replaceState(result.state, true)
    return result.handled
  }

  #replaceState(next: RichTextEditingState, countChange: boolean): void {
    const changed =
      !sameContent(this.#state.content, next.content) ||
      JSON.stringify(this.#state.typingStyle) !==
        JSON.stringify(next.typingStyle) ||
      JSON.stringify(this.#state.paragraphStyle) !==
        JSON.stringify(next.paragraphStyle)
    this.#state = next
    if (countChange && changed) this.#revision += 1
  }
}

function cssColor(color: RichTextSpanStyle['color']): string {
  return `rgba(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)}, ${color.alpha})`
}

function paragraphContentEnd(
  text: string,
  paragraph: RichTextParagraph,
): number {
  return paragraph.end > paragraph.start && text[paragraph.end - 1] === '\n'
    ? paragraph.end - 1
    : paragraph.end
}

/** Rebuilds the transient DOM projection without persisting any HTML. */
export function renderRichTextProjection(
  editor: HTMLDivElement,
  state: RichTextEditingState,
  scale = 1,
): void {
  const fragment = document.createDocumentFragment()
  const paragraphs =
    state.content.paragraphs.length === 0
      ? [
          {
            start: 0,
            end: 0,
            alignment: state.paragraphStyle.alignment,
            listKind: state.paragraphStyle.listKind,
          } as const,
        ]
      : state.content.paragraphs

  for (const paragraph of paragraphs) {
    const block = document.createElement('div')
    block.dataset.richTextParagraph = ''
    block.dataset.start = String(paragraph.start)
    block.dataset.end = String(paragraph.end)
    block.dataset.listKind = paragraph.listKind
    block.style.textAlign = paragraph.alignment
    const contentEnd = paragraphContentEnd(state.content.text, paragraph)
    for (const span of state.content.spans) {
      const start = Math.max(span.start, paragraph.start)
      const end = Math.min(span.end, contentEnd)
      if (end <= start) continue
      const element = document.createElement('span')
      element.dataset.richTextSpan = ''
      element.dataset.start = String(start)
      element.dataset.end = String(end)
      element.style.fontFamily = span.fontFamily
      element.style.fontSize = `${span.fontSize * scale}px`
      element.style.fontWeight = String(span.weight)
      element.style.fontStyle = span.italic ? 'italic' : 'normal'
      element.style.textDecoration = span.strikethrough
        ? 'line-through'
        : 'none'
      element.style.color = cssColor(span.color)
      element.textContent = state.content.text.slice(start, end)
      block.append(element)
    }
    if (!block.textContent) block.append(document.createElement('br'))
    fragment.append(block)
  }
  editor.replaceChildren(fragment)
}

/** Reads only text nodes and logical block boundaries; markup is discarded. */
export function readRichTextProjection(editor: HTMLDivElement): string {
  const paragraphs = Array.from(
    editor.querySelectorAll<HTMLElement>('[data-rich-text-paragraph]'),
  )
  if (paragraphs.length === 0) {
    return (editor.innerText || editor.textContent || '').replace(
      /\r\n?/gu,
      '\n',
    )
  }
  return paragraphs.map((paragraph) => paragraph.textContent ?? '').join('\n')
}

function endpointOffset(
  editor: HTMLDivElement,
  node: Node,
  offset: number,
): number {
  if (node === editor) {
    const child = editor.childNodes[offset]
    if (child instanceof HTMLElement) {
      return Number(child.dataset.start ?? 0)
    }
    return readRichTextProjection(editor).length
  }
  const element = node instanceof Element ? node : node.parentElement
  const paragraph = element?.closest<HTMLElement>('[data-rich-text-paragraph]')
  if (!paragraph || !editor.contains(paragraph)) return 0
  const start = Number(paragraph.dataset.start ?? 0)
  if (node instanceof Text) {
    const span = node.parentElement?.closest<HTMLElement>(
      '[data-rich-text-span]',
    )
    if (span) {
      return (
        Number(span.dataset.start ?? start) +
        Math.max(0, Math.min(node.data.length, offset))
      )
    }
  }
  const range = document.createRange()
  range.setStart(paragraph, 0)
  try {
    range.setEnd(node, offset)
  } catch (error) {
    if (error instanceof DOMException) return start
    throw error
  }
  return start + range.toString().length
}

export function readRichTextDomSelection(
  editor: HTMLDivElement,
): RichTextSelection {
  const selection = window.getSelection()
  if (
    !selection?.anchorNode ||
    !selection.focusNode ||
    !editor.contains(selection.anchorNode) ||
    !editor.contains(selection.focusNode)
  ) {
    const end = readRichTextProjection(editor).length
    return Object.freeze({ anchor: end, focus: end })
  }
  return Object.freeze({
    anchor: endpointOffset(
      editor,
      selection.anchorNode,
      selection.anchorOffset,
    ),
    focus: endpointOffset(editor, selection.focusNode, selection.focusOffset),
  })
}

function domPointAtOffset(
  editor: HTMLDivElement,
  offset: number,
): Readonly<{ node: Node; offset: number }> {
  const spans = Array.from(
    editor.querySelectorAll<HTMLElement>('[data-rich-text-span]'),
  )
  const exact = spans.find((span) => Number(span.dataset.start) === offset)
  const containing =
    exact ??
    spans.find(
      (span) =>
        Number(span.dataset.start) <= offset &&
        offset <= Number(span.dataset.end),
    )
  const text = containing?.firstChild
  if (containing && text instanceof Text) {
    return Object.freeze({
      node: text,
      offset: Math.max(0, offset - Number(containing.dataset.start)),
    })
  }
  const paragraphs = Array.from(
    editor.querySelectorAll<HTMLElement>('[data-rich-text-paragraph]'),
  )
  const paragraph =
    paragraphs.find(
      (candidate) =>
        Number(candidate.dataset.start) === offset &&
        Number(candidate.dataset.end) === offset,
    ) ?? paragraphs.at(-1)
  return Object.freeze({ node: paragraph ?? editor, offset: 0 })
}

export function restoreRichTextDomSelection(
  editor: HTMLDivElement,
  selection: RichTextSelection,
): void {
  const browserSelection = window.getSelection()
  if (!browserSelection) return
  const anchor = domPointAtOffset(editor, selection.anchor)
  const focus = domPointAtOffset(editor, selection.focus)
  browserSelection.removeAllRanges()
  if (typeof browserSelection.setBaseAndExtent === 'function') {
    browserSelection.setBaseAndExtent(
      anchor.node,
      anchor.offset,
      focus.node,
      focus.offset,
    )
    return
  }
  const range = document.createRange()
  const forward = selection.anchor <= selection.focus
  const start = forward ? anchor : focus
  const end = forward ? focus : anchor
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  browserSelection.addRange(range)
}
