import type { RenderTextStyle } from '@cute-screen/editor-core'
import type { ImageResource, ImageResourceInput } from '../../types'

export type Context2D = Pick<
  CanvasRenderingContext2D,
  | 'clearRect'
  | 'drawImage'
  | 'getImageData'
  | 'putImageData'
  | 'fillRect'
  | 'strokeRect'
  | 'beginPath'
  | 'ellipse'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'rect'
  | 'clip'
  | 'quadraticCurveTo'
  | 'fill'
  | 'stroke'
  | 'save'
  | 'restore'
  | 'translate'
  | 'scale'
  | 'rotate'
  | 'setTransform'
  | 'globalAlpha'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'globalCompositeOperation'
  | 'createLinearGradient'
  | 'createRadialGradient'
  | 'createPattern'
  | 'setLineDash'
  | 'fillText'
  | 'strokeText'
  | 'measureText'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'shadowColor'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
  | 'shadowBlur'
  | 'imageSmoothingEnabled'
>

export interface Canvas2DLike {
  width: number
  height: number
  getContext(type: '2d'): Context2D | null
  toBlob?: (callback: BlobCallback, type?: string) => void
  encode?: (format: 'png') => Promise<Uint8Array>
}

export interface Canvas2DImageResource extends ImageResource {
  readonly source: ImageResourceInput['source']
}

export interface Canvas2DRendererOptions {
  readonly now?: () => number
  readonly exportCanvas?: (width: number, height: number) => Canvas2DLike
  /** Mirrors browser unicode-range font selection in deterministic headless tests. */
  readonly resolveFontFamily?: (text: string, style: RenderTextStyle) => string
}
