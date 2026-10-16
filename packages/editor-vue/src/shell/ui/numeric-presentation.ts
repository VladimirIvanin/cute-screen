import type { ContextControl } from '../types'

export interface NumericPresentation {
  readonly slider?: boolean
  readonly stepper?: boolean
  readonly unit?: string
  readonly displayScale?: number
  readonly presets?: readonly number[]
}

export function numericPresentation(control: Extract<ContextControl, { kind: 'range' }>): NumericPresentation {
  if (control.numeric) return control.numeric
  const { id } = control
  if (id === 'loupeZoom') return { stepper: true, unit: '×', presets: [1, 2, 4, 8, 16] }
  if (id === 'rulerAngle') return { stepper: true, unit: '°', presets: [15, 30, 45, 90] }
  if (id === 'rulerFontSize') return { stepper: true, unit: 'px', presets: [12, 16, 24, 32, 48] }
  if (id === 'imageOpacity') return { slider: true, unit: '%', displayScale: 100 }
  if (id === 'layerOpacity' || id === 'spotlightDimOpacity') return { slider: true, unit: '%' }
  if (id === 'censorBlurStrength') return { slider: true }
  if (id === 'width') return { slider: true, unit: 'px', presets: [1, 2, 4, 8, 16] }
  return { slider: true, unit: 'px' }
}
