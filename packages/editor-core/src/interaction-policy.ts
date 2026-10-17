import type { LayerKind } from './document/types'

export interface LayerInteractionPolicy {
  readonly primaryHit: 'geometry' | 'bounds'
  readonly selectedMove: 'frame' | 'geometry'
  readonly marginCss: number
}
const path = { primaryHit: 'geometry', selectedMove: 'frame', marginCss: 6 } as const
const content = { primaryHit: 'bounds', selectedMove: 'frame', marginCss: 0 } as const

/** Interaction preferences are implementation policy, never persisted document data. */
export const LAYER_INTERACTION_POLICIES = {
  arrow: path,
  ruler: path,
  pencil: path,
  marker: path,
  shape: { primaryHit: 'geometry', selectedMove: 'frame', marginCss: 6 },
  text: content,
  image: content,
  emoji: content,
  numberedMarker: { primaryHit: 'geometry', selectedMove: 'frame', marginCss: 0 },
  callout: { primaryHit: 'geometry', selectedMove: 'frame', marginCss: 6 },
  censor: { primaryHit: 'geometry', selectedMove: 'frame', marginCss: 0 },
  spotlight: { primaryHit: 'geometry', selectedMove: 'frame', marginCss: 0 },
  loupe: { primaryHit: 'geometry', selectedMove: 'frame', marginCss: 0 },
} as const satisfies Readonly<Record<LayerKind, LayerInteractionPolicy>>

export const SELECTION_DRAG_THRESHOLD_CSS = 4
export const SMALL_SELECTION_SIZE_CSS = 32
