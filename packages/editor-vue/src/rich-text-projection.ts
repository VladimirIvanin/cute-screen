import type {
  RichTextEditingState,
  RichTextLayout,
  RichTextSpanStyle,
} from '@cute-screen/editor-renderer'

function styledSpan(
  state: RichTextEditingState,
  style: RichTextSpanStyle,
  start: number,
  end: number,
  scale: number,
  hidden: boolean,
): HTMLSpanElement {
  const element = document.createElement('span')
  element.dataset.richTextSpan = ''
  element.dataset.start = String(start)
  element.dataset.end = String(end)
  element.style.fontFamily = style.fontFamily
  element.style.fontSize = `${hidden ? 0 : style.fontSize * scale}px`
  element.style.fontWeight = String(style.weight)
  element.style.lineHeight = '1.25'
  element.style.fontStyle = style.italic ? 'italic' : 'normal'
  element.style.textDecoration = style.strikethrough ? 'line-through' : 'none'
  const color = style.color
  element.style.color = `rgba(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)}, ${color.alpha})`
  element.textContent = state.content.text.slice(start, end)
  return element
}

/** Soft breaks are view-only BRs: textContent and UTF-16 bookmarks stay intact. */
export function renderRichTextProjection(
  editor: HTMLDivElement,
  state: RichTextEditingState,
  scale = 1,
  layout?: RichTextLayout,
): void {
  const fragment = document.createDocumentFragment()
  const paragraphs = state.content.paragraphs.length ? state.content.paragraphs : [{
    start: 0, end: 0, ...state.paragraphStyle,
  }]
  editor.classList.toggle('cs-text-editor--measured', !!layout)
  for (const paragraph of paragraphs) {
    const block = document.createElement('div')
    block.dataset.richTextParagraph = ''
    block.dataset.start = String(paragraph.start)
    block.dataset.end = String(paragraph.end)
    block.dataset.listKind = paragraph.listKind
    block.style.textAlign = paragraph.alignment
    const end = paragraph.end > paragraph.start && state.content.text[paragraph.end - 1] === '\n'
      ? paragraph.end - 1 : paragraph.end
    const lines = layout?.lines.filter((line) => line.start >= paragraph.start && line.start <= end) ?? []
    if (lines.length) {
      // Every line in a paragraph uses its largest span, matching renderer metrics.
      // A caret's typing size must not change the paragraph's CSS strut or height.
      const height = Math.max(...lines.map((line) => line.height)) * scale
      block.style.fontSize = `${height / 1.25}px`
      block.style.lineHeight = `${height}px`
      block.style.minHeight = `${height}px`
    }
    const breaks = lines.slice(1).map((line) => line.start)
    const hidden = lines.flatMap((line, index) => {
      const next = lines[index + 1]?.start ?? end
      return next > line.end ? [{ start: line.end, end: next }] : []
    })
    const points = [...new Set([paragraph.start, end, ...breaks,
      ...hidden.flatMap((range) => [range.start, range.end]),
      ...state.content.spans.flatMap((span) => [span.start, span.end]),
    ])].filter((point) => point >= paragraph.start && point <= end).sort((a, b) => a - b)
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]!, stop = points[index + 1]!
      if (breaks.includes(start)) {
        const br = document.createElement('br')
        br.dataset.richTextSoftBreak = ''
        block.append(br)
      }
      const style = state.content.spans.find((span) => span.start <= start && span.end > start)
      if (style) block.append(styledSpan(state, style, start, stop, scale,
        hidden.some((range) => range.start <= start && stop <= range.end)))
    }
    if (!block.textContent) block.append(document.createElement('br'))
    fragment.append(block)
  }
  editor.replaceChildren(fragment)
}
