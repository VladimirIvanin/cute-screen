import type {
  CardBackground,
  CardBranding,
  CardColor,
  CompositionSettings,
  CompositionStart,
} from './types'

export const cardColor = (red: number,
  green: number,
  blue: number,
  alpha = 1): CardColor => ({ red,
  green,
  blue,
  alpha })
export function createCardBackground(kind: CardBackground['kind'] = 'linear'): CardBackground {
  const a = cardColor(0.34, 0.34, 0.94)
  const b = cardColor(0.92, 0.55, 0.78)
  const stops = [{ position: 0, color: a }, { position: 1, color: b }]
  return {
    kind, color: a,
    linear: { stops, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    radial: { stops, center: { x: 0.5, y: 0.5 }, radius: 0.7 },
    freeform: { version: 1, points: [
      { id: 'a', x: 0.15, y: 0.2, radius: 0.55, color: a },
      { id: 'b', x: 0.85, y: 0.8, radius: 0.55, color: b },
      { id: 'c', x: 0.9, y: 0.05, radius: 0.45, color: cardColor(0.25, 0.85, 0.9) },
    ] },
    image: null, fit: 'cover', scale: 1, offset: { x: 0, y: 0 }, blur: 24,
  }
}
export function createComposition(start: CompositionStart = 'padding'): CompositionSettings {
  const band = ['header', 'footer', 'bands'].includes(start)
  return {
    version: 1,
    layout: { mode: 'auto', width: 1080, height: 1080,
      insets: { top: band ? 0 : 8, right: band ? 0 : 8, bottom: band ? 0 : 8, left: band ? 0 : 8,
        unit: 'percent', linked: true },
      alignment: { x: 0.5, y: 0.5 }, scale: 1, offset: { x: 0, y: 0 } },
    background: createCardBackground(),
    header: { height: start === 'header' || start === 'bands' ? 80 : 0, fill: createCardBackground('solid') },
    footer: { height: start === 'footer' || start === 'bands' ? 80 : 0, fill: createCardBackground('solid') },
    frame: { kind: start === 'phone' ? 'phone' : start === 'browser' ? 'browser' : 'none',
      theme: 'light', title: '', url: '', orientation: 'portrait', fit: 'contain',
      screenColor: cardColor(0.96, 0.96, 0.98), zoom: 1, offset: { x: 0, y: 0 } },
    radius: band ? 0 : 12, shadow: band ? 0 : 0.3, branding: [],
  }
}
export function createCardBranding(
  id: string,
  year: number,
): CardBranding {
  return { id, template: '', text: '', year, image: null, imageSize: 32, region: 'card',
    alignment: { x: 1, y: 1 }, offset: { x: 0, y: 0 }, textAlignment: 'start', fontFamily: 'Roboto', fontSize: 20,
    color: cardColor(1, 1, 1), opacity: 1, padding: 16, backplate: null }
}
export function resolveBrandingYear(
  block: CardBranding,
  year: number,
): CardBranding {
  return { ...block, year, text: block.template.replaceAll('{year}', String(year)) }
}
/** Presets are snapshots, never references to another document's mutable settings. */
export function compositionPreset(settings: CompositionSettings): CompositionSettings {
  return { ...settings, frame: { ...settings.frame, title: '', url: '' } }
}
