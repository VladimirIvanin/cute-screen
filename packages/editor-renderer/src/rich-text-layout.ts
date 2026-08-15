import type {
  RenderTextNode,
  RenderTextStyle,
  RgbaColor,
} from '@cute-screen/editor-core'

const TEXT_LINE_HEIGHT = 1.25
const FALLBACK_LINE_ASCENT = 0.8
const FALLBACK_LINE_DESCENT = 0.2

export type RichTextMeasureResult =
  | number
  | Readonly<{
      width: number
      /** Actual glyph ink bounds used for visual centering. */
      ascent: number
      descent: number
      /** Font box metrics used for a CSS-compatible line baseline. */
      lineAscent?: number
      lineDescent?: number
    }>

export type RichTextMeasure = (
  text: string,
  style: RenderTextStyle,
) => RichTextMeasureResult

export interface RichTextLayoutFragment extends RenderTextStyle {
  readonly text: string
  readonly start: number
  readonly end: number
  readonly x: number
  readonly baseline: number
  readonly width: number
}

export interface RichTextStrike {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly thickness: number
  readonly color: RgbaColor
}

export interface RichTextBullet {
  readonly centerX: number
  readonly centerY: number
  readonly radius: number
  readonly color: RgbaColor
}

export interface RichTextLayoutLine {
  readonly text: string
  readonly start: number
  readonly end: number
  readonly x: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly baseline: number
  readonly fragments: readonly RichTextLayoutFragment[]
  readonly strikes: readonly RichTextStrike[]
  readonly bullet?: RichTextBullet
}

export interface RichTextLayout {
  readonly width: number
  readonly height: number
  readonly lines: readonly RichTextLayoutLine[]
}

interface StyledCodePoint {
  readonly text: string
  readonly start: number
  readonly end: number
  readonly style: RenderTextStyle
  readonly width: number
  readonly ascent: number
  readonly descent: number
  readonly baselineOffset: number
  readonly whitespace: boolean
  readonly newline: boolean
}

interface PendingLine {
  readonly glyphs: readonly StyledCodePoint[]
  readonly paragraphIndex: number
  readonly paragraphLineIndex: number
  readonly alignment: 'start' | 'center' | 'end'
  readonly listKind: 'none' | 'bullet'
  readonly contentX: number
  readonly contentWidth: number
  readonly paragraphFontSize: number
}

function styledCodePoints(
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

function glyphWidth(glyphs: readonly StyledCodePoint[]): number {
  return glyphs.reduce((total, glyph) => total + glyph.width, 0)
}

function trimTrailingWhitespace(
  glyphs: readonly StyledCodePoint[],
): readonly StyledCodePoint[] {
  let end = glyphs.length
  while (end > 0 && glyphs[end - 1]!.whitespace) end -= 1
  return glyphs.slice(0, end)
}

function trimLeadingWhitespace(
  glyphs: readonly StyledCodePoint[],
): readonly StyledCodePoint[] {
  let start = 0
  while (start < glyphs.length && glyphs[start]!.whitespace) start += 1
  return glyphs.slice(start)
}

function wrapParagraph(
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

function sameStyle(left: RenderTextStyle, right: RenderTextStyle): boolean {
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
export function layoutRichText(
  node: RenderTextNode,
  measure: RichTextMeasure,
): RichTextLayout {
  if (node.text.length === 0) {
    return Object.freeze({ width: 0, height: 0, lines: Object.freeze([]) })
  }

  const layoutWidth =
    node.wrap === 'fixedWidth'
      ? Math.min(node.width, node.fixedWidth ?? node.width)
      : node.width
  const pendingLines: PendingLine[] = []

  for (const [paragraphIndex, paragraph] of node.paragraphs.entries()) {
    const glyphs = styledCodePoints(
      node,
      paragraph.start,
      paragraph.end,
      measure,
    )
    const paragraphFontSize = glyphs.reduce(
      (largest, glyph) => Math.max(largest, glyph.style.fontSize),
      node.runs[0]?.fontSize ?? 1,
    )
    const listIndent =
      paragraph.listKind === 'bullet' ? paragraphFontSize * 1.1 : 0
    const contentX = node.x + listIndent
    const contentWidth = Math.max(1, layoutWidth - listIndent)
    const wrapped = wrapParagraph(
      glyphs,
      contentWidth,
      node.wrap === 'fixedWidth',
    )
    for (const [paragraphLineIndex, line] of wrapped.entries()) {
      pendingLines.push({
        glyphs: line,
        paragraphIndex,
        paragraphLineIndex,
        alignment: paragraph.alignment,
        listKind: paragraph.listKind,
        contentX,
        contentWidth,
        paragraphFontSize,
      })
    }
  }

  const lineHeights = pendingLines.map((line) =>
    Math.max(
      1,
      ...line.glyphs.map((glyph) => glyph.style.fontSize * TEXT_LINE_HEIGHT),
      line.paragraphFontSize * TEXT_LINE_HEIGHT,
    ),
  )
  const totalHeight = lineHeights.reduce((total, height) => total + height, 0)
  const lineTops: number[] = []
  const lineBaselineOffsets: number[] = []
  let rawTop = node.y
  for (const [lineIndex, line] of pendingLines.entries()) {
    lineTops.push(rawTop)
    lineBaselineOffsets.push(
      Math.max(
        line.paragraphFontSize *
          (FALLBACK_LINE_ASCENT +
            (TEXT_LINE_HEIGHT - FALLBACK_LINE_ASCENT - FALLBACK_LINE_DESCENT) /
              2),
        ...line.glyphs.map((glyph) => glyph.baselineOffset),
      ),
    )
    rawTop += lineHeights[lineIndex]!
  }
  let verticalShift = 0
  if (node.verticalAlign === 'visualCenter' && pendingLines.length > 0) {
    let inkTop = Number.POSITIVE_INFINITY
    let inkBottom = Number.NEGATIVE_INFINITY
    for (const [lineIndex, line] of pendingLines.entries()) {
      const baseline = lineTops[lineIndex]! + lineBaselineOffsets[lineIndex]!
      if (line.glyphs.length === 0) {
        inkTop = Math.min(
          inkTop,
          baseline - line.paragraphFontSize * FALLBACK_LINE_ASCENT,
        )
        inkBottom = Math.max(
          inkBottom,
          baseline + line.paragraphFontSize * FALLBACK_LINE_DESCENT,
        )
      } else {
        for (const glyph of line.glyphs) {
          inkTop = Math.min(inkTop, baseline - glyph.ascent)
          inkBottom = Math.max(inkBottom, baseline + glyph.descent)
        }
      }
    }
    verticalShift = node.y + node.height / 2 - (inkTop + inkBottom) / 2
  }
  const lines: RichTextLayoutLine[] = []

  for (const [lineIndex, line] of pendingLines.entries()) {
    const height = lineHeights[lineIndex]!
    const width = glyphWidth(line.glyphs)
    const x =
      line.alignment === 'center'
        ? line.contentX + (line.contentWidth - width) / 2
        : line.alignment === 'end'
          ? line.contentX + line.contentWidth - width
          : line.contentX
    const top = lineTops[lineIndex]! + verticalShift
    const baseline = top + lineBaselineOffsets[lineIndex]!
    const fragments: RichTextLayoutFragment[] = []
    let cursor = x
    for (const glyph of line.glyphs) {
      const previous = fragments[fragments.length - 1]
      if (
        previous &&
        previous.end === glyph.start &&
        sameStyle(previous, glyph.style)
      ) {
        fragments[fragments.length - 1] = {
          ...previous,
          text: previous.text + glyph.text,
          end: glyph.end,
          width: previous.width + glyph.width,
        }
      } else {
        fragments.push({
          ...glyph.style,
          text: glyph.text,
          start: glyph.start,
          end: glyph.end,
          x: cursor,
          baseline,
          width: glyph.width,
        })
      }
      cursor += glyph.width
    }
    const strikes = fragments
      .filter((fragment) => fragment.strikethrough && fragment.width > 0)
      .map((fragment) => ({
        x: fragment.x,
        y: fragment.baseline - fragment.fontSize * 0.3,
        width: fragment.width,
        thickness: Math.max(1, fragment.fontSize * 0.06),
        color: fragment.color,
      }))
    const first = line.glyphs[0]
    const last = line.glyphs[line.glyphs.length - 1]
    lines.push(
      Object.freeze({
        text: line.glyphs.map((glyph) => glyph.text).join(''),
        start: first?.start ?? node.paragraphs[line.paragraphIndex]!.start,
        end: last?.end ?? node.paragraphs[line.paragraphIndex]!.start,
        x,
        top,
        width,
        height,
        baseline,
        fragments: Object.freeze(
          fragments.map((fragment) => Object.freeze(fragment)),
        ),
        strikes: Object.freeze(strikes.map((strike) => Object.freeze(strike))),
        ...(line.listKind === 'bullet' && line.paragraphLineIndex === 0
          ? {
              bullet: Object.freeze({
                centerX: node.x + line.paragraphFontSize * 0.35,
                centerY: top + height / 2,
                radius: Math.max(1, line.paragraphFontSize * 0.1),
                color: first?.style.color ?? node.runs[0]!.color,
              }),
            }
          : {}),
      }),
    )
  }

  return Object.freeze({
    width: layoutWidth,
    height: totalHeight,
    lines: Object.freeze(lines),
  })
}
