import type { ContextControl } from '../types'

export interface NumericPresentation {
  readonly slider?: boolean
  readonly stepper?: boolean
  readonly unit?: string
  readonly displayScale?: number
  readonly presets?: readonly number[]
}

const LOUPE_ZOOM: NumericPresentation = { stepper: true, unit: '×', presets: [1, 2, 4, 8, 16] }
const RULER_ANGLE: NumericPresentation = { stepper: true, unit: '°', presets: [15, 30, 45, 90] }
const RULER_FONT_SIZE: NumericPresentation = { stepper: true, unit: 'px', presets: [12, 16, 24, 32, 48] }
const IMAGE_OPACITY: NumericPresentation = { slider: true, unit: '%', displayScale: 100 }
const PERCENT: NumericPresentation = { slider: true, unit: '%' }
const SLIDER: NumericPresentation = { slider: true }
const WIDTH: NumericPresentation = { slider: true, unit: 'px', presets: [1, 2, 4, 8, 16] }
const PIXELS: NumericPresentation = { slider: true, unit: 'px' }

const BY_ID: Record<string, NumericPresentation> = {
  loupeZoom: LOUPE_ZOOM,
  rulerAngle: RULER_ANGLE,
  rulerFontSize: RULER_FONT_SIZE,
  imageOpacity: IMAGE_OPACITY,
  layerOpacity: PERCENT,
  spotlightDimOpacity: PERCENT,
  censorBlurStrength: SLIDER,
  width: WIDTH,
}

export function numericPresentation(control: Extract<ContextControl, { kind: 'range' }>): NumericPresentation {
  if (control.numeric) return control.numeric
  return BY_ID[control.id] ?? PIXELS
}
