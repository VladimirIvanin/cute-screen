import type { RenderTextNode, RenderTextStyle } from '@cute-screen/editor-core'
import type { RichTextMeasure, StyledCodePoint } from './contracts'

const TEXT_LINE_HEIGHT = 1.25
const FALLBACK_LINE_ASCENT = 0.8
const FALLBACK_LINE_DESCENT = 0.2

export function styledCodePoints(
  node: RenderTextNode,
  start: number,
  end: number,
  measure: RichTextMeasure,
): readonly StyledCodePoint[] {
  const glyphs: StyledCodePoint[] = []
  let offset = start
  let runIndex = node.runs.findIndex((run) => run.end > start)
  for (const text of node.text.slice(start, end)) {
    while (runIndex >= 0 && offset >= node.runs[runIndex]!.end) runIndex += 1
    const style = node.runs[runIndex]
    if (!style || offset < style.start)
      throw new RangeError(`No rich-text run covers UTF-16 offset ${offset}`)
    const next = offset + text.length
    const measurement = measure(text, style)
    const measured =
      typeof measurement === 'number'
        ? {
            width: measurement,
            ascent: style.fontSize * FALLBACK_LINE_ASCENT,
            descent: style.fontSize * FALLBACK_LINE_DESCENT,
          }
        : measurement
    const lineAscent =
      measured.lineAscent ?? style.fontSize * FALLBACK_LINE_ASCENT
    const lineDescent =
      measured.lineDescent ?? style.fontSize * FALLBACK_LINE_DESCENT
    const halfLeading =
      (style.fontSize * TEXT_LINE_HEIGHT - lineAscent - lineDescent) / 2
    glyphs.push({
      text,
      start: offset,
      end: next,
      style,
      width: text === '\n' || text === '\r' ? 0 : measured.width,
      ascent: measured.ascent,
      descent: measured.descent,
      baselineOffset: lineAscent + halfLeading,
      whitespace: text !== '\n' && text !== '\r' && /\s/u.test(text),
      newline: text === '\n' || text === '\r',
    })
    offset = next
  }
  return glyphs
}

export function glyphWidth(glyphs: readonly StyledCodePoint[]): number {
  return glyphs.reduce((total, glyph) => total + glyph.width, 0)
}

export function trimTrailingWhitespace(
  glyphs: readonly StyledCodePoint[],
): readonly StyledCodePoint[] {
  let end = glyphs.length
  while (end > 0 && glyphs[end - 1]!.whitespace) end -= 1
  return glyphs.slice(0, end)
}

export function trimLeadingWhitespace(
  glyphs: readonly StyledCodePoint[],
): readonly StyledCodePoint[] {
  let start = 0
  while (start < glyphs.length && glyphs[start]!.whitespace) start += 1
  return glyphs.slice(start)
}

export function wrapParagraph(
  glyphs: readonly StyledCodePoint[],
  maximumWidth: number,
  wrap: boolean,
): readonly (readonly StyledCodePoint[])[] {
  const lines: (readonly StyledCodePoint[])[] = []
  let pending: StyledCodePoint[] = []
  let pendingWidth = 0
  let endedWithNewline = false

  const commit = (line: readonly StyledCodePoint[]): void => {
    lines.push(trimTrailingWhitespace(line))
  }

  for (const glyph of glyphs) {
    if (glyph.newline) {
      commit(pending)
      pending = []
      pendingWidth = 0
      endedWithNewline = true
      continue
    }
    endedWithNewline = false
    if (
      !wrap ||
      pending.length === 0 ||
      pendingWidth + glyph.width <= maximumWidth
    ) {
      pending.push(glyph)
      pendingWidth += glyph.width
      continue
    }

    let breakIndex = -1
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (pending[index]!.whitespace) {
        breakIndex = index
        break
      }
    }
    if (breakIndex >= 0) {
      commit(pending.slice(0, breakIndex))
      pending = [...trimLeadingWhitespace(pending.slice(breakIndex + 1))]
      pendingWidth = glyphWidth(pending)
    } else {
      commit(pending)
      pending = []
      pendingWidth = 0
    }

    if (pending.length > 0 && pendingWidth + glyph.width > maximumWidth) {
      commit(pending)
      pending = []
      pendingWidth = 0
    }
    if (!glyph.whitespace || pending.length > 0) {
      pending.push(glyph)
      pendingWidth += glyph.width
    }
  }
  if (pending.length > 0 || (lines.length === 0 && !endedWithNewline))
    commit(pending)
  return lines
}

export function sameStyle(
  left: RenderTextStyle,
  right: RenderTextStyle,
): boolean {
  return (
    left.fontFamily === right.fontFamily &&
    left.fontSize === right.fontSize &&
    left.fontWeight === right.fontWeight &&
    left.fontStyle === right.fontStyle &&
    left.strikethrough === right.strikethrough &&
    left.color.red === right.color.red &&
    left.color.green === right.color.green &&
    left.color.blue === right.color.blue &&
    left.color.alpha === right.color.alpha
  )
}

/**
 * Produces immutable line/run geometry shared by Canvas2D preview/export and
 * CanvasKit. Source offsets remain UTF-16 because they are document offsets;
 * traversal itself advances by complete Unicode code points.
 */
