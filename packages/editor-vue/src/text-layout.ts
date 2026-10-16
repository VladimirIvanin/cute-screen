import {
  layoutRichText,
  type RichTextContent,
  type RichTextLayout,
  type RenderTextNode,
  type RenderTextStyle,
  type TextLayer,
  type EditorCommand,
} from '@cute-screen/editor-renderer'

/** Point text grows to this document-space width; manual widths are unrestricted. */
export const INITIAL_TEXT_MAX_WIDTH = 480

export function layoutTextContent(
  content: RichTextContent,
  maximumWidth = Infinity,
  emptyFontSize = 24,
): RichTextLayout {
  const node: RenderTextNode = {
    id: 'text-measurement', kind: 'text', x: 0, y: 0, width: 1, height: 1,
    rotation: 0, opacity: 1, visible: true, text: content.text, wrap: 'autoSize',
    runs: content.spans.map((span) => ({
      ...span, fontWeight: span.weight, fontStyle: span.italic ? 'italic' : 'normal',
    })),
    paragraphs: content.paragraphs,
  }
  // One scratch context per layout, shared by every glyph/run measurement.
  const context = document.createElement('canvas').getContext('2d')
  if (!context) throw new Error('Text measurement requires Canvas2D')
  const measurements = new Map<string, ReturnType<CanvasRenderingContext2D['measureText']>>()
  const measure = (text: string, style: RenderTextStyle) => {
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px "${style.fontFamily.replaceAll('"', '')}", sans-serif`
    const key = `${font}\u0000${text}`
    let metrics = measurements.get(key)
    if (!metrics) {
      context.font = font
      metrics = context.measureText(text)
      measurements.set(key, metrics)
    }
    return {
      width: metrics.width,
      ascent: metrics.actualBoundingBoxAscent ?? style.fontSize * 0.8,
      descent: metrics.actualBoundingBoxDescent ?? style.fontSize * 0.2,
      lineAscent: metrics.fontBoundingBoxAscent ?? style.fontSize * 0.8,
      lineDescent: metrics.fontBoundingBoxDescent ?? style.fontSize * 0.2,
    }
  }
  if (!content.text) return { width: emptyFontSize, height: emptyFontSize * 1.25, lines: [] }
  const natural = layoutRichText({ ...node,
    paragraphs: node.paragraphs.map((paragraph) => ({ ...paragraph, alignment: 'start' })),
  }, measure)
  const naturalWidth = Math.max(1, ...natural.lines.map((line) => line.x + line.width))
  const width = content.wrap === 'fixedWidth' ? content.fixedWidth ?? maximumWidth : Math.min(maximumWidth, Math.ceil(naturalWidth * 64) / 64)
  return layoutRichText({ ...node, width, wrap: 'fixedWidth', fixedWidth: width }, measure)
}

export function measuredTextLayer<T extends TextLayer>(
  layer: T,
  maximumWidth = Infinity,
): T {
  const current = layer.payload.content
  const natural = layoutTextContent(current)
  const content = current.wrap === 'autoSize' && natural.width > maximumWidth
    ? { ...current, wrap: 'fixedWidth' as const, fixedWidth: maximumWidth } : current
  const layout = content === current ? natural : layoutTextContent(content)
  return { ...layer, localBounds: { ...layer.localBounds, width: layout.width, height: layout.height },
    payload: { ...layer.payload, content } }
}

/** Preserve a single command/history boundary when pasting styles onto a group. */
export function measuredTextCommand(command: EditorCommand): EditorCommand {
  if (command.type === 'batch') return { ...command, commands: command.commands.map(measuredTextCommand) }
  if (command.type === 'updateLayer' && command.after.kind === 'text')
    return { ...command, after: measuredTextLayer(command.after) }
  return command
}

export function measuredTextHeight(
  content: RichTextContent,
  width: number,
): number {
  return layoutTextContent({ ...content, wrap: 'fixedWidth', fixedWidth: width }).height
}
