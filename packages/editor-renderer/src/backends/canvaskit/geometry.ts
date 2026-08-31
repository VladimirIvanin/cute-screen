import type { RenderNode } from '@cute-screen/editor-core'
import type {
  CanvasKitApi,
  CanvasKitCanvas,
  CanvasKitFontData,
  CanvasKitFontMetricsSource,
  CanvasKitPath,
  CanvasKitTypeface,
} from './contracts'

export function withTransform(
  canvas: CanvasKitCanvas,
  node: RenderNode,
  centerX: number,
  centerY: number,
  draw: () => void,
): void {
  canvas.save()
  const originX = node.transformOriginX ?? centerX
  const originY = node.transformOriginY ?? centerY
  const scaleX = node.scaleX ?? 1
  const scaleY = node.scaleY ?? 1
  if (node.rotation !== 0 || scaleX !== 1 || scaleY !== 1) {
    canvas.translate(originX, originY)
    canvas.rotate(node.rotation, 0, 0)
    canvas.scale(scaleX, scaleY)
    canvas.translate(-originX, -originY)
  }
  draw()
  canvas.restore()
}

/** Leaves the device-space clip created under a layer transform in place while
 * returning drawing coordinates to the parent scene transform. */
export function cancelNodeTransform(
  canvas: CanvasKitCanvas,
  node: RenderNode,
  centerX: number,
  centerY: number,
): void {
  const originX = node.transformOriginX ?? centerX
  const originY = node.transformOriginY ?? centerY
  const scaleX = node.scaleX ?? 1
  const scaleY = node.scaleY ?? 1
  if (node.rotation === 0 && scaleX === 1 && scaleY === 1) return
  canvas.translate(originX, originY)
  canvas.scale(1 / scaleX, 1 / scaleY)
  canvas.rotate(-node.rotation, 0, 0)
  canvas.translate(-originX, -originY)
}

export function roundedRectPath(
  canvasKit: CanvasKitApi,
  node: Extract<RenderNode, { readonly kind: 'rect' }>,
): CanvasKitPath {
  const builder = new canvasKit.PathBuilder()
  try {
    const radius = Math.min(
      node.cornerRadius ?? 0,
      node.width / 2,
      node.height / 2,
    )
    if (radius <= 0) {
      builder.moveTo(node.x, node.y)
      builder.lineTo(node.x + node.width, node.y)
      builder.lineTo(node.x + node.width, node.y + node.height)
      builder.lineTo(node.x, node.y + node.height)
      builder.close()
      return builder.detach()
    }
    // Cubic approximation of a circular quarter; Canvas2D uses a quadratic
    // corner, while this keeps CanvasKit's path renderer deterministic.
    const kappa = radius * 0.552_284_75
    builder.moveTo(node.x + radius, node.y)
    builder.lineTo(node.x + node.width - radius, node.y)
    builder.cubicTo(
      node.x + node.width - radius + kappa,
      node.y,
      node.x + node.width,
      node.y + radius - kappa,
      node.x + node.width,
      node.y + radius,
    )
    builder.lineTo(node.x + node.width, node.y + node.height - radius)
    builder.cubicTo(
      node.x + node.width,
      node.y + node.height - radius + kappa,
      node.x + node.width - radius + kappa,
      node.y + node.height,
      node.x + node.width - radius,
      node.y + node.height,
    )
    builder.lineTo(node.x + radius, node.y + node.height)
    builder.cubicTo(
      node.x + radius - kappa,
      node.y + node.height,
      node.x,
      node.y + node.height - radius + kappa,
      node.x,
      node.y + node.height - radius,
    )
    builder.lineTo(node.x, node.y + radius)
    builder.cubicTo(
      node.x,
      node.y + radius - kappa,
      node.x + radius - kappa,
      node.y,
      node.x + radius,
      node.y,
    )
    builder.close()
    return builder.detach()
  } finally {
    builder.delete()
  }
}

function glyphInkBounds(
  font: CanvasKitFontMetricsSource,
  text: string,
): Readonly<{ top: number; bottom: number }> | undefined {
  const glyphs = font.getGlyphIDs?.(text)
  if (!glyphs || glyphs.length === 0 || !font.getGlyphBounds) return undefined
  const bounds = font.getGlyphBounds(glyphs)
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (let index = 0; index + 3 < bounds.length; index += 4) {
    const glyphTop = bounds[index + 1] ?? Number.NaN
    const glyphBottom = bounds[index + 3] ?? Number.NaN
    if (!Number.isFinite(glyphTop) || !Number.isFinite(glyphBottom)) continue
    top = Math.min(top, glyphTop)
    bottom = Math.max(bottom, glyphBottom)
  }
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom > top
    ? { top, bottom }
    : undefined
}

function metricInkBounds(
  font: CanvasKitFontMetricsSource,
): Readonly<{ top: number; bottom: number }> | undefined {
  const metrics = font.getMetrics?.()
  if (!metrics) return undefined
  if (
    Number.isFinite(metrics.ascent) &&
    Number.isFinite(metrics.descent) &&
    metrics.descent > metrics.ascent
  ) {
    return { top: metrics.ascent, bottom: metrics.descent }
  }
  const top = metrics.bounds?.[1] ?? Number.NaN
  const bottom = metrics.bounds?.[3] ?? Number.NaN
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom > top
    ? { top, bottom }
    : undefined
}

export function canvasKitInkBounds(
  font: CanvasKitFontMetricsSource,
  text: string,
  fontSize: number,
): Readonly<{ top: number; bottom: number }> {
  return (
    glyphInkBounds(font, text) ??
    metricInkBounds(font) ?? { top: -fontSize * 0.8, bottom: fontSize * 0.2 }
  )
}

export function canvasKitLineMetrics(
  font: CanvasKitFontMetricsSource,
  fontSize: number,
): Readonly<{ ascent: number; descent: number }> {
  const metrics = font.getMetrics?.()
  const ascent = metrics ? -metrics.ascent : Number.NaN
  const descent = metrics?.descent ?? Number.NaN
  return {
    ascent: Number.isFinite(ascent) && ascent >= 0 ? ascent : fontSize * 0.8,
    descent:
      Number.isFinite(descent) && descent >= 0 ? descent : fontSize * 0.2,
  }
}

export function resolveCanvasKitVisualCenterBaseline(
  font: CanvasKitFontMetricsSource,
  text: string,
  y: number,
  height: number,
  lineHeight: number,
  fontSize: number,
): number {
  const lines = text.split('\n')
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (const [index, line] of lines.entries()) {
    if (line.length === 0) continue
    const ink = canvasKitInkBounds(font, line, fontSize)
    top = Math.min(top, index * lineHeight + ink.top)
    bottom = Math.max(bottom, index * lineHeight + ink.bottom)
  }
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
    const fallback = canvasKitInkBounds(font, '0', fontSize)
    top = fallback.top
    bottom = (lines.length - 1) * lineHeight + fallback.bottom
  }
  return y + height / 2 - (top + bottom) / 2
}

export function canvasKitTextWidth(
  font: CanvasKitFontMetricsSource,
  text: string,
  fontSize: number,
): number {
  const measured = font.getTextWidth?.(text)
  if (typeof measured === 'number' && Number.isFinite(measured)) return measured
  const glyphs = font.getGlyphIDs?.(text)
  if (glyphs && font.getGlyphWidths) {
    return font
      .getGlyphWidths(glyphs)
      .reduce((total, width) => total + width, 0)
  }
  return Array.from(text).length * fontSize * 0.6
}

interface ResolvedCanvasKitTypeface {
  readonly key: string
  readonly typeface: CanvasKitTypeface
}

export function requiresCyrillicCoverage(text: string): boolean {
  return /[\u0400-\u052f]/u.test(text)
}

export function hasGlyphCoverage(
  source: Pick<CanvasKitFontMetricsSource, 'getGlyphIDs'>,
  text: string,
): boolean {
  const glyphs = source.getGlyphIDs?.(text)
  return (
    glyphs !== null &&
    glyphs !== undefined &&
    glyphs.length === Array.from(text).length &&
    !glyphs.some((glyph) => glyph === 0)
  )
}

export class CanvasKitTypefaceStore {
  readonly #typefaces = new Map<string, CanvasKitTypeface>()

  constructor(canvasKit: CanvasKitApi, fontData: readonly CanvasKitFontData[]) {
    const makeTypeface = canvasKit.Typeface?.MakeFreeTypeFaceFromData
    if (!makeTypeface) return
    for (const font of fontData) {
      const typeface = makeTypeface(font.data.slice(0))
      if (typeface) {
        this.#typefaces.set(
          `${font.family.toLowerCase()}\u0000${font.subset}`,
          typeface,
        )
      }
    }
  }

  resolve(family: string, text: string): ResolvedCanvasKitTypeface | undefined {
    const requireCoverage = requiresCyrillicCoverage(text)
    const subset = requireCoverage ? 'cyrillic' : 'latin'
    const normalizedFamily = family.toLowerCase()
    const exactKey = `${normalizedFamily}\u0000${subset}`
    const exact = this.#typefaces.get(exactKey)
    if (exact && (!requireCoverage || hasGlyphCoverage(exact, text)))
      return { key: exactKey, typeface: exact }
    for (const [key, typeface] of this.#typefaces) {
      if (
        key.endsWith(`\u0000${subset}`) &&
        (!requireCoverage || hasGlyphCoverage(typeface, text))
      )
        return { key, typeface }
    }
    if (!requireCoverage) {
      const fallback = this.#typefaces.entries().next().value as
        readonly [string, CanvasKitTypeface] | undefined
      return fallback ? { key: fallback[0], typeface: fallback[1] } : undefined
    }
    for (const [key, typeface] of this.#typefaces) {
      if (hasGlyphCoverage(typeface, text)) return { key, typeface }
    }
    return undefined
  }

  dispose(): void {
    for (const typeface of this.#typefaces.values()) typeface.delete()
    this.#typefaces.clear()
  }
}
