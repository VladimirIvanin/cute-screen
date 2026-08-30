import type { RenderTextNode } from '@cute-screen/editor-core'
import type { RichTextLayout, RichTextMeasure } from './contracts'
import { buildLineMetrics, buildPendingLines, layoutPendingLine } from './lines'

export function layoutRichText(
  node: RenderTextNode,
  measure: RichTextMeasure,
): RichTextLayout {
  if (node.text.length === 0) {
    return Object.freeze({ width: 0, height: 0, lines: Object.freeze([]) })
  }
  const width =
    node.wrap === 'fixedWidth'
      ? Math.min(node.width, node.fixedWidth ?? node.width)
      : node.width
  const pending = buildPendingLines(node, measure, width)
  const metrics = buildLineMetrics(node, pending)
  const lines = pending.map((line, index) =>
    layoutPendingLine(node, line, index, metrics),
  )
  return Object.freeze({
    width,
    height: metrics.totalHeight,
    lines: Object.freeze(lines),
  })
}
