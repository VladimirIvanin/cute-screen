import { DEFAULT_PRESENTATION_SETTINGS } from '../document/types'
import type { CardFrame } from './types'
import {
  cardColor,
  createComposition,
} from './defaults'
import { resolveCompositionLayout } from './layout'
import { frameNodes } from './scene-frame'
import { phoneOverlay } from './scene-phone'
import { phoneScreenRadius } from './frame-catalog'
import { cardRect } from './scene-primitives'

/** Thumbnails use production contours and hardware, rather than a second icon catalogue. */
export function createFramePreview(frame: CardFrame) {
  const base = createComposition()
  const composition = { ...base, frame: { ...frame, orientation: 'portrait' as const, title: '', url: '' },
    layout: { ...base.layout, insets: { ...base.layout.insets, top: 0, right: 0, bottom: 0, left: 0 } } }
  const layout = resolveCompositionLayout({ canvas: { width: 360, height: frame.kind === 'phone' ? 780 : 180 },
    crop: null, presentation: { ...DEFAULT_PRESENTATION_SETTINGS, composition } })
  return { width: layout.width, height: layout.height, nodes: [
    ...frameNodes(composition, layout),
    cardRect('card:preview:content', layout.viewport, cardColor(0.48, 0.64, 0.89),
      frame.kind === 'phone' && frame.phoneContentMode === 'fullscreen' ? phoneScreenRadius(frame, layout.screen) : 0),
    ...phoneOverlay(composition.frame, layout.screen),
  ] }
}
