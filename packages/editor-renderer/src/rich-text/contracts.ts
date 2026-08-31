import type { RenderTextStyle, RgbaColor } from '@cute-screen/editor-core'

export const TEXT_LINE_HEIGHT = 1.25
export const FALLBACK_LINE_ASCENT = 0.8
export const FALLBACK_LINE_DESCENT = 0.2

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

export interface StyledCodePoint {
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

export interface PendingLine {
  readonly glyphs: readonly StyledCodePoint[]
  readonly paragraphIndex: number
  readonly paragraphLineIndex: number
  readonly alignment: 'start' | 'center' | 'end'
  readonly listKind: 'none' | 'bullet'
  readonly contentX: number
  readonly contentWidth: number
  readonly paragraphFontSize: number
}
