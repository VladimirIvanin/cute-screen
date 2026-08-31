import type { RenderNode, RenderTextStyle } from '@cute-screen/editor-core'
import { layoutRichText } from '../../rich-text/layout'
import type { Canvas2DRendererOptions, Context2D } from './contracts'
import { canvasFont, cssColor, withTransform } from './paint'

type TextNode = Extract<RenderNode, { kind: 'text' }>
type FontResolver = NonNullable<Canvas2DRendererOptions['resolveFontFamily']>

function measureText(
  context: Context2D,
  resolveFontFamily: FontResolver,
  text: string,
  style: RenderTextStyle,
) {
  context.font = canvasFont(style, resolveFontFamily(text, style))
  const metrics = context.measureText(text)
  return {
    width: metrics.width,
    ascent: Number.isFinite(metrics.actualBoundingBoxAscent)
      ? metrics.actualBoundingBoxAscent
      : style.fontSize * 0.8,
    descent: Number.isFinite(metrics.actualBoundingBoxDescent)
      ? metrics.actualBoundingBoxDescent
      : style.fontSize * 0.2,
    lineAscent: Number.isFinite(metrics.fontBoundingBoxAscent)
      ? metrics.fontBoundingBoxAscent
      : style.fontSize * 0.8,
    lineDescent: Number.isFinite(metrics.fontBoundingBoxDescent)
      ? metrics.fontBoundingBoxDescent
      : style.fontSize * 0.2,
  }
}

export function drawTextNode2D(
  context: Context2D,
  node: TextNode,
  resolveFontFamily: FontResolver,
): void {
  withTransform(
    context,
    node,
    node.x + node.width / 2,
    node.y + node.height / 2,
    () => {
      const layout = layoutRichText(node, (text, style) =>
        measureText(context, resolveFontFamily, text, style),
      )
      context.textAlign = 'left'
      context.textBaseline = 'alphabetic'
      for (const line of layout.lines) {
        if (line.bullet) {
          context.beginPath()
          context.ellipse(
            line.bullet.centerX,
            line.bullet.centerY,
            line.bullet.radius,
            line.bullet.radius,
            0,
            0,
            Math.PI * 2,
          )
          context.fillStyle = cssColor(line.bullet.color)
          context.fill()
        }
        for (const fragment of line.fragments) {
          context.font = canvasFont(
            fragment,
            resolveFontFamily(fragment.text, fragment),
          )
          context.fillStyle = cssColor(fragment.color)
          context.fillText(fragment.text, fragment.x, fragment.baseline)
        }
        for (const strike of line.strikes) {
          context.beginPath()
          context.moveTo(strike.x, strike.y)
          context.lineTo(strike.x + strike.width, strike.y)
          context.strokeStyle = cssColor(strike.color)
          context.lineWidth = strike.thickness
          context.lineCap = 'butt'
          context.stroke()
        }
      }
    },
  )
}
