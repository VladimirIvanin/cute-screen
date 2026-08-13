import type { SrgbColor } from './document/types'

export interface HsvColor {
  readonly hue: number
  readonly saturation: number
  readonly value: number
}

export interface ColorSuggestion {
  readonly id: 'contrast' | 'complementary' | 'analogous'
  readonly color: SrgbColor
  readonly contrastRatio?: number
}

const NEUTRALS = Object.freeze([
  '#FFFFFF',
  '#E7E7E8',
  '#C7C7CA',
  '#9A9A9F',
  '#68686E',
  '#414146',
  '#202024',
  '#000000',
])

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function channel(value: number): number {
  return Math.round(clamp(value, 0, 1) * 255)
}

function hexPart(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase()
}

export function normalizeHex(value: string): string | undefined {
  const raw = value.trim().replace(/^#/u, '')
  if (/^[\da-f]{3}$/iu.test(raw)) {
    return `#${raw
      .split('')
      .map((part) => part + part)
      .join('')
      .toUpperCase()}`
  }
  return /^[\da-f]{6}$/iu.test(raw) ? `#${raw.toUpperCase()}` : undefined
}

export function hexToSrgb(value: string): SrgbColor | undefined {
  const hex = normalizeHex(value)
  if (!hex) return undefined
  return Object.freeze({
    red: Number.parseInt(hex.slice(1, 3), 16) / 255,
    green: Number.parseInt(hex.slice(3, 5), 16) / 255,
    blue: Number.parseInt(hex.slice(5, 7), 16) / 255,
    alpha: 1,
  })
}

export function srgbToHex(
  color: Pick<SrgbColor, 'red' | 'green' | 'blue'>,
): string {
  return `#${hexPart(channel(color.red))}${hexPart(channel(color.green))}${hexPart(channel(color.blue))}`
}

export function srgbToHsv(
  color: Pick<SrgbColor, 'red' | 'green' | 'blue'>,
): HsvColor {
  const red = clamp(color.red, 0, 1)
  const green = clamp(color.green, 0, 1)
  const blue = clamp(color.blue, 0, 1)
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let hue = 0
  if (delta > 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6)
    else if (max === green) hue = 60 * ((blue - red) / delta + 2)
    else hue = 60 * ((red - green) / delta + 4)
  }
  return Object.freeze({
    hue: (hue + 360) % 360,
    saturation: max === 0 ? 0 : (delta / max) * 100,
    value: max * 100,
  })
}

export function hsvToSrgb(hsv: HsvColor): SrgbColor {
  const hue = ((hsv.hue % 360) + 360) % 360
  const saturation = clamp(hsv.saturation, 0, 100) / 100
  const value = clamp(hsv.value, 0, 100) / 100
  const chroma = value * saturation
  const sector = hue / 60
  const x = chroma * (1 - Math.abs((sector % 2) - 1))
  const [red, green, blue] =
    sector < 1
      ? [chroma, x, 0]
      : sector < 2
        ? [x, chroma, 0]
        : sector < 3
          ? [0, chroma, x]
          : sector < 4
            ? [0, x, chroma]
            : sector < 5
              ? [x, 0, chroma]
              : [chroma, 0, x]
  const match = value - chroma
  return Object.freeze({
    red: red + match,
    green: green + match,
    blue: blue + match,
    alpha: 1,
  })
}

export function colorPalette(
  color: SrgbColor,
  preservedHue?: number,
): readonly SrgbColor[] {
  const hsv = srgbToHsv(color)
  const hue = hsv.saturation < 1 ? (preservedHue ?? 0) : hsv.hue
  const neutral = NEUTRALS.map((hex) => hexToSrgb(hex)!)
  const offsets = [-42, -28, -14, 0, 14, 28, 42, 56]
  const profiles = [
    { saturation: 28, value: 96 },
    { saturation: 52, value: 91 },
    { saturation: 78, value: 78 },
  ]
  return Object.freeze([
    ...neutral,
    ...profiles.flatMap((profile) =>
      offsets.map((offset) => hsvToSrgb({ hue: hue + offset, ...profile })),
    ),
  ])
}

function luminance(color: SrgbColor): number {
  const linear = [color.red, color.green, color.blue].map((value) => {
    const normalized = clamp(value, 0, 1)
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}

export function contrastRatio(first: SrgbColor, second: SrgbColor): number {
  const [light, dark] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  )
  return (light! + 0.05) / (dark! + 0.05)
}

export function colorSuggestions(
  color: SrgbColor,
  preservedHue?: number,
): readonly ColorSuggestion[] {
  const hsv = srgbToHsv(color)
  const hue = hsv.saturation < 1 ? (preservedHue ?? 0) : hsv.hue
  const black = hexToSrgb('#171719')!
  const white = hexToSrgb('#FFFFFF')!
  const blackContrast = contrastRatio(color, black)
  const whiteContrast = contrastRatio(color, white)
  const contrast = blackContrast > whiteContrast ? black : white
  return Object.freeze([
    Object.freeze({
      id: 'contrast',
      color: contrast,
      contrastRatio: Math.max(blackContrast, whiteContrast),
    }),
    Object.freeze({
      id: 'complementary',
      color: hsvToSrgb({
        hue: hue + 180,
        saturation: Math.max(52, hsv.saturation),
        value: Math.max(72, hsv.value),
      }),
    }),
    Object.freeze({
      id: 'analogous',
      color: hsvToSrgb({
        hue: hue + 32,
        saturation: Math.max(38, hsv.saturation * 0.72),
        value: Math.min(96, Math.max(76, hsv.value)),
      }),
    }),
  ])
}
