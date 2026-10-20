import type { GradientPlacement } from '@cute-screen/editor-renderer'
import type {
  IconName,
  TranslationKey,
} from '../types'

export const GRADIENT_PLACEMENTS = [
  { id: 'gradientAlignLeft', placement: 'left', icon: 'objectAlignLeft', en: 'Left', ru: 'Слева' },
  { id: 'gradientAlignCenterX', placement: 'centerX', icon: 'objectAlignCenterX', en: 'Center', ru: 'Центр' },
  { id: 'gradientAlignRight', placement: 'right', icon: 'objectAlignRight', en: 'Right', ru: 'Справа' },
  { id: 'gradientFitWidth', placement: 'width', icon: 'stretchX', en: 'Width', ru: 'Ширина' },
  { id: 'gradientAlignTop', placement: 'top', icon: 'objectAlignTop', en: 'Top', ru: 'Сверху' },
  { id: 'gradientAlignCenterY', placement: 'centerY', icon: 'objectAlignCenterY', en: 'Middle', ru: 'Центр' },
  { id: 'gradientAlignBottom', placement: 'bottom', icon: 'objectAlignBottom', en: 'Bottom', ru: 'Снизу' },
  { id: 'gradientFitHeight', placement: 'height', icon: 'stretchY', en: 'Height', ru: 'Высота' },
] as const satisfies readonly {
  id: TranslationKey
  placement: GradientPlacement
  icon: IconName
  en: string
  ru: string
}[]
