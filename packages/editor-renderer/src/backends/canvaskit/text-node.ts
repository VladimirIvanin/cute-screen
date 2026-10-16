import type {
  RenderNode,
  RenderTextStyle,
} from '@cute-screen/editor-core'
import { layoutRichText } from '../../rich-text/layout'
import type {
  CanvasKitApi,
  CanvasKitCanvas,
  CanvasKitFont,
  CanvasKitPaint,
  CanvasKitTypeface,
} from './contracts'
import {
  CanvasKitTypefaceStore,
  canvasKitInkBounds,
  canvasKitLineMetrics,
  canvasKitTextWidth,
  hasGlyphCoverage,
  requiresCyrillicCoverage,
  withTransform,
} from './geometry'
import {
  blendMode,
  configurePaint,
} from './paint'

type TextNode = Extract<RenderNode, { kind: 'text' }>

function unavailableFont(
  node: TextNode,
  style: RenderTextStyle,
  text: string,
): Error {
  if (requiresCyrillicCoverage(text)) {
    return new Error(`CanvasKit glyph coverage is unavailable for "${node.text}" in ${style.fontFamily}`)
  }
  return new Error(`CanvasKit typeface is unavailable for ${style.fontFamily}`)
}

function createFontResolver(
  canvasKit: CanvasKitApi,
  node: TextNode,
  typefaces: CanvasKitTypefaceStore | undefined,
  defaultTypeface: CanvasKitTypeface | undefined,
  fonts: Map<string, CanvasKitFont>,
) {
  return (style: RenderTextStyle, text: string): CanvasKitFont => {
    const resolved = typefaces?.resolve(style.fontFamily, text)
    const typeface = resolved?.typeface ?? defaultTypeface
    if (!typeface) throw unavailableFont(node, style, text)
    const key = [resolved?.key ?? 'default', style.fontSize, style.fontWeight, style.fontStyle].join('\u0000')
    const existing = fonts.get(key)
    if (existing) {
      if (requiresCyrillicCoverage(text) && !hasGlyphCoverage(existing, text)) {
        throw unavailableFont(node, style, text)
      }
      return existing
    }
    const font = new canvasKit.Font!(typeface, style.fontSize)
    font.setEmbolden?.(style.fontWeight >= 600)
    font.setSkewX?.(style.fontStyle === 'italic' ? -0.2 : 0)
    if (requiresCyrillicCoverage(text) && !hasGlyphCoverage(font, text)) {
      font.delete()
      throw unavailableFont(node, style, text)
    }
    fonts.set(key, font)
    return font
  }
}

function scriptChunks(text: string): readonly string[] {
  return requiresCyrillicCoverage(text)
    ? text.match(/[\u0400-\u052f]+|[^\u0400-\u052f]+/gu) ?? [] : [text]
}

function drawTextLayout(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: TextNode,
  fill: CanvasKitPaint,
  stroke: CanvasKitPaint,
  fontForStyle: (style: RenderTextStyle, text: string) => CanvasKitFont,
): void {
  const layout = layoutRichText(node, (text, style) => {
    const metrics = scriptChunks(text).map((chunk) => {
      const font = fontForStyle(style, chunk)
      const ink = canvasKitInkBounds(font, chunk, style.fontSize)
      const line = canvasKitLineMetrics(font, style.fontSize)
      return {
        width: canvasKitTextWidth(font, chunk, style.fontSize),
        ascent: Math.max(0, -ink.top), descent: Math.max(0, ink.bottom),
        lineAscent: line.ascent, lineDescent: line.descent,
      }
    })
    return {
      width: metrics.reduce((sum, chunk) => sum + chunk.width, 0),
      ascent: Math.max(0, ...metrics.map((chunk) => chunk.ascent)),
      descent: Math.max(0, ...metrics.map((chunk) => chunk.descent)),
      lineAscent: Math.max(0, ...metrics.map((chunk) => chunk.lineAscent)),
      lineDescent: Math.max(0, ...metrics.map((chunk) => chunk.lineDescent)),
    }
  })
  for (const line of layout.lines) {
    if (line.bullet) {
      configurePaint(canvasKit, fill, line.bullet.color, node.opacity, 'fill')
      fill.setBlendMode(blendMode(canvasKit, node.blendMode))
      canvas.drawOval(
        canvasKit.LTRBRect(
          line.bullet.centerX - line.bullet.radius,
          line.bullet.centerY - line.bullet.radius,
          line.bullet.centerX + line.bullet.radius,
          line.bullet.centerY + line.bullet.radius,
        ),
        fill,
      )
    }
    for (const fragment of line.fragments) {
      configurePaint(canvasKit, fill, fragment.color, node.opacity, 'fill')
      fill.setBlendMode(blendMode(canvasKit, node.blendMode))
      // Fontsource script subsets are separate typefaces. A merged layout
      // fragment can contain both scripts (including Latin digits and spaces).
      const chunks = scriptChunks(fragment.text)
      let x = fragment.x
      for (const chunk of chunks) {
        const font = fontForStyle(fragment, chunk)
        canvas.drawText!(chunk, x, fragment.baseline, fill, font)
        x += canvasKitTextWidth(font, chunk, fragment.fontSize)
      }
    }
    for (const strike of line.strikes) {
      configurePaint(canvasKit, stroke, strike.color, node.opacity, 'stroke', strike.thickness)
      stroke.setBlendMode(blendMode(canvasKit, node.blendMode))
      canvas.drawLine(strike.x, strike.y, strike.x + strike.width, strike.y, stroke)
    }
  }
}

export function drawTextNodeCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: TextNode,
  typefaces?: CanvasKitTypefaceStore,
): void {
  if (
    !canvasKit.Font ||
    !canvasKit.Typeface ||
    !canvas.drawText
  ) return
  const defaultTypeface = canvasKit.Typeface.MakeDefault?.() ?? canvasKit.Typeface.GetDefault?.()
  if (!defaultTypeface && !typefaces) return
  const fonts = new Map<string, CanvasKitFont>()
  const fill = new canvasKit.Paint()
  const stroke = new canvasKit.Paint()
  const fontForStyle = createFontResolver(canvasKit, node, typefaces, defaultTypeface, fonts)
  try {
    withTransform(canvas, node, node.x + node.width / 2, node.y + node.height / 2, () =>
      drawTextLayout(canvasKit, canvas, node, fill, stroke, fontForStyle))
  } finally {
    fill.delete()
    stroke.delete()
    for (const font of fonts.values()) font.delete()
    defaultTypeface?.delete()
  }
}
