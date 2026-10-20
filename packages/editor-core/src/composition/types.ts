/** Persisted card settings contain parameters and immutable resource references only. */
export interface CardColor {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}
export interface CardPoint { readonly x: number
  readonly y: number }
export interface CardStop { readonly position: number
  readonly color: CardColor }
export interface FreeformPoint extends CardPoint {
  readonly id: string
  readonly color: CardColor
  readonly radius: number
}
export interface CardImage {
  readonly blobHash: string
  readonly width: number
  readonly height: number
  readonly format: 'png' | 'jpeg' | 'webp' | 'svg'
}
export interface CardBackground {
  readonly kind: 'transparent' | 'solid' | 'linear' | 'radial' | 'freeform' | 'image' | 'blurred'
  readonly color: CardColor
  readonly linear: { readonly stops: readonly CardStop[]
    readonly start: CardPoint
    readonly end: CardPoint }
  readonly radial: { readonly stops: readonly CardStop[]
    readonly center: CardPoint
    readonly radius: number }
  readonly freeform: { readonly version: 1
    readonly points: readonly FreeformPoint[] }
  readonly image: CardImage | null
  readonly fit: 'cover' | 'contain'
  readonly scale: number
  readonly offset: CardPoint
  readonly blur: number
}
export interface CardBand { readonly height: number
  readonly fill: CardBackground }
export interface CardLayout {
  readonly mode: 'auto' | 'fixed'
  readonly width: number
  readonly height: number
  readonly insets: {
    readonly top: number
    readonly right: number
    readonly bottom: number
    readonly left: number
    readonly unit: 'px' | 'percent'
    readonly linked: boolean
  }
  readonly alignment: CardPoint
  readonly scale: number
  readonly offset: CardPoint
}
export interface CardFrame {
  readonly kind: 'none' | 'window' | 'browser' | 'phone'
  readonly theme: 'light' | 'dark'
  readonly title: string
  readonly url: string
  readonly orientation: 'portrait' | 'landscape'
  readonly fit: 'contain' | 'cover'
  readonly screenColor: CardColor
  readonly zoom: number
  readonly offset: CardPoint
}
export interface CardBranding {
  readonly id: string
  readonly template: string
  readonly text: string
  readonly year: number
  readonly image: CardImage | null
  readonly imageSize: number
  readonly region: 'content' | 'card' | 'header' | 'footer'
  readonly alignment: CardPoint
  readonly offset: CardPoint
  readonly textAlignment: 'start' | 'center' | 'end'
  readonly fontFamily: string
  readonly fontSize: number
  readonly color: CardColor
  readonly opacity: number
  readonly padding: number
  readonly backplate: CardColor | null
}
export interface CardShadowOptions {
  readonly size: number
  readonly softness: number
  readonly spread: number
  readonly offset: CardPoint
  readonly color: CardColor
}
export interface CompositionSettings {
  readonly version: 1
  readonly layout: CardLayout
  readonly background: CardBackground
  readonly header: CardBand
  readonly footer: CardBand
  readonly frame: CardFrame
  readonly radius: number
  readonly shadow: number
  readonly shadowOptions?: CardShadowOptions
  readonly branding: readonly CardBranding[]
}
export type CompositionStart = 'padding' | 'header' | 'footer' | 'bands' | 'browser' | 'phone'
