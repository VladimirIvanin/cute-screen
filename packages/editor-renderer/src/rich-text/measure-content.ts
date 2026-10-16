import type {
  RichTextContent,
  RenderTextNode,
  RenderTextStyle,
} from '@cute-screen/editor-core'
import { layoutRichText } from './layout'
import type {
  RichTextLayout,
  RichTextMeasure,
} from './contracts'

const layouts = new Map<string, RichTextLayout>()
let fontSet: FontFaceSet | undefined
let fontRevision = 0
function invalidateFonts(): void {
  fontRevision += 1
  layouts.clear()
}
function observeFonts(): void {
  if (typeof document === 'undefined' || fontSet === document.fonts) return
  fontSet?.removeEventListener?.('loadingdone', invalidateFonts)
  fontSet?.removeEventListener?.('loadingerror', invalidateFonts)
  fontSet = document.fonts
  fontSet?.addEventListener?.('loadingdone', invalidateFonts)
  fontSet?.addEventListener?.('loadingerror', invalidateFonts)
  invalidateFonts()
}

export function measureRichTextContent(
  content: RichTextContent,
  maximumWidth = Infinity,
  emptyFontSize = 24,
  measureOverride?: RichTextMeasure,
): RichTextLayout {
  observeFonts()
  const fontState = typeof document !== 'undefined' && document.fonts?.check
    ? content.spans.map((span) => document.fonts.check(`${span.italic ? 'italic' : 'normal'} ${span.weight} 20px "${span.fontFamily}"`, 'Aa Яя 123'))
    : []
  const cacheKey = JSON.stringify([content, String(maximumWidth), emptyFontSize, fontState, fontRevision])
  const cached = layouts.get(cacheKey)
  if (cached && !measureOverride) return cached
  const node: RenderTextNode = {
    id: 'text-measurement', kind: 'text', x: 0, y: 0, width: 1, height: 1,
    rotation: 0, opacity: 1, visible: true, text: content.text, wrap: 'autoSize',
    runs: content.spans.map((span) => ({
      ...span, fontWeight: span.weight, fontStyle: span.italic ? 'italic' : 'normal',
    })),
    paragraphs: content.paragraphs,
  }
  // One scratch context per layout, shared by every glyph/run measurement.
  const context = measureOverride ? undefined : document.createElement('canvas').getContext('2d')
  if (!context && !measureOverride) throw new Error('Text measurement requires Canvas2D')
  const measurements = new Map<string, ReturnType<CanvasRenderingContext2D['measureText']>>()
  const measure: RichTextMeasure = measureOverride ?? ((text: string, style: RenderTextStyle) => {
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px "${style.fontFamily.replaceAll('"', '')}", sans-serif`
    const key = `${font}\u0000${text}`
    let metrics = measurements.get(key)
    if (!metrics) {
      context!.font = font
      metrics = context!.measureText(text)
      measurements.set(key, metrics)
    }
    return {
      width: metrics.width,
      ascent: metrics.actualBoundingBoxAscent ?? style.fontSize * 0.8,
      descent: metrics.actualBoundingBoxDescent ?? style.fontSize * 0.2,
      lineAscent: metrics.fontBoundingBoxAscent ?? style.fontSize * 0.8,
      lineDescent: metrics.fontBoundingBoxDescent ?? style.fontSize * 0.2,
    }
  })
  if (!content.text) return { width: emptyFontSize, height: emptyFontSize * 1.25, lines: [] }
  const natural = layoutRichText({ ...node,
    paragraphs: node.paragraphs.map((paragraph) => ({ ...paragraph, alignment: 'start' })),
  }, measure)
  const naturalWidth = Math.max(1, ...natural.lines.map((line) => line.x + line.width))
  const width = content.wrap === 'fixedWidth' ? content.fixedWidth ?? maximumWidth : Math.min(maximumWidth, Math.ceil(naturalWidth * 64) / 64)
  const result = layoutRichText({ ...node, width, wrap: 'fixedWidth', fixedWidth: width }, measure)
  if (layouts.size >= 256) layouts.delete(layouts.keys().next().value!)
  if (!measureOverride) layouts.set(cacheKey, result)
  return result
}
