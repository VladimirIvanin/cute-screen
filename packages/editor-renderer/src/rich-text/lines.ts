import type { RenderTextNode } from '@cute-screen/editor-core'
import {
  FALLBACK_LINE_ASCENT,
  FALLBACK_LINE_DESCENT,
  TEXT_LINE_HEIGHT,
  type PendingLine,
  type RichTextLayoutFragment,
  type RichTextLayoutLine,
  type RichTextMeasure,
} from './contracts'
import { glyphWidth, sameStyle, styledCodePoints, wrapParagraph } from './wrap'

export interface LineMetrics {
  readonly heights: readonly number[]
  readonly tops: readonly number[]
  readonly baselineOffsets: readonly number[]
  readonly totalHeight: number
  readonly verticalShift: number
}

export function buildPendingLines(
  node: RenderTextNode,
  measure: RichTextMeasure,
  layoutWidth: number,
): readonly PendingLine[] {
  const pending: PendingLine[] = []
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
      pending.push({
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
  return pending
}

function lineHeight(line: PendingLine): number {
  return Math.max(
    1,
    ...line.glyphs.map((glyph) => glyph.style.fontSize * TEXT_LINE_HEIGHT),
    line.paragraphFontSize * TEXT_LINE_HEIGHT,
  )
}

function baselineOffset(line: PendingLine): number {
  const fallback =
    line.paragraphFontSize *
    (FALLBACK_LINE_ASCENT +
      (TEXT_LINE_HEIGHT - FALLBACK_LINE_ASCENT - FALLBACK_LINE_DESCENT) / 2)
  return Math.max(fallback, ...line.glyphs.map((glyph) => glyph.baselineOffset))
}

function visualBounds(
  pending: readonly PendingLine[],
  tops: readonly number[],
  baselineOffsets: readonly number[],
): Readonly<{ top: number; bottom: number }> {
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (const [lineIndex, line] of pending.entries()) {
    const baseline = tops[lineIndex]! + baselineOffsets[lineIndex]!
    if (line.glyphs.length === 0) {
      top = Math.min(
        top,
        baseline - line.paragraphFontSize * FALLBACK_LINE_ASCENT,
      )
      bottom = Math.max(
        bottom,
        baseline + line.paragraphFontSize * FALLBACK_LINE_DESCENT,
      )
      continue
    }
    for (const glyph of line.glyphs) {
      top = Math.min(top, baseline - glyph.ascent)
      bottom = Math.max(bottom, baseline + glyph.descent)
    }
  }
  return { top, bottom }
}

export function buildLineMetrics(
  node: RenderTextNode,
  pending: readonly PendingLine[],
): LineMetrics {
  const heights = pending.map(lineHeight)
  const totalHeight = heights.reduce((total, height) => total + height, 0)
  const tops: number[] = []
  const baselineOffsets: number[] = []
  let top = node.y
  for (const [index, line] of pending.entries()) {
    tops.push(top)
    baselineOffsets.push(baselineOffset(line))
    top += heights[index]!
  }
  const bounds = visualBounds(pending, tops, baselineOffsets)
  const verticalShift =
    node.verticalAlign === 'visualCenter' && pending.length > 0
      ? node.y + node.height / 2 - (bounds.top + bounds.bottom) / 2
      : 0
  return { heights, tops, baselineOffsets, totalHeight, verticalShift }
}

function lineX(line: PendingLine, width: number): number {
  if (line.alignment === 'center') {
    return line.contentX + (line.contentWidth - width) / 2
  }
  if (line.alignment === 'end') return line.contentX + line.contentWidth - width
  return line.contentX
}

function lineFragments(
  line: PendingLine,
  x: number,
  baseline: number,
): readonly RichTextLayoutFragment[] {
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
  return fragments
}

export function layoutPendingLine(
  node: RenderTextNode,
  line: PendingLine,
  index: number,
  metrics: LineMetrics,
): RichTextLayoutLine {
  const height = metrics.heights[index]!
  const width = glyphWidth(line.glyphs)
  const x = lineX(line, width)
  const top = metrics.tops[index]! + metrics.verticalShift
  const baseline = top + metrics.baselineOffsets[index]!
  const fragments = lineFragments(line, x, baseline)
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
  return Object.freeze({
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
  })
}
