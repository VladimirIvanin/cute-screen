import {
  freezeJsonObject,
  readJsonObject,
} from '../document/json'
import type {
  CardBackground,
  CardBranding,
  CompositionSettings,
} from './types'

type Obj = Record<string, unknown>
export function number(
  value: unknown,
  field: string,
  min = -1_000_000,
  max = 1_000_000,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) throw new Error(`composition.${field} is invalid`)
  return value
}
export function choice(
  value: unknown,
  field: string,
  choices: readonly string[],
): void {
  if (typeof value !== 'string' || !choices.includes(value)) throw new Error(`composition.${field} is invalid`)
}
function string(
  value: unknown,
  field: string,
): void {
  if (typeof value !== 'string' || value.length > 16_384) throw new Error(`composition.${field} is invalid`)
}
export function point(
  value: unknown,
  field: string,
  min = -1_000_000,
  max = 1_000_000,
): void {
  const p = readJsonObject(value, field)
  number(p.x, `${field}.x`, min, max)
  number(p.y, `${field}.y`, min, max)
}
export function color(
  value: unknown,
  field: string,
): void {
  const c = readJsonObject(value, field)
  for (const name of ['red', 'green', 'blue', 'alpha']) number(c[name], `${field}.${name}`, 0, 1)
}
function stops(
  value: unknown,
  field: string,
): void {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > 8
  ) throw new Error(`composition.${field} requires 2–8 stops`)
  let previous = 0
  for (const entry of value) {
    const stop = readJsonObject(entry, field)
    previous = number(stop.position, field, previous, 1)
    color(stop.color, field)
  }
}
export function image(value: unknown): void {
  if (value === null) return
  const ref = readJsonObject(value, 'image')
  if (Object.keys(ref).some((key) => !['blobHash', 'width', 'height', 'format'].includes(key))) throw new Error('composition images require blob references only')
  if (typeof ref.blobHash !== 'string' || !/^[a-f0-9]{64}$/u.test(ref.blobHash)) throw new Error('composition image reference is invalid')
  number(ref.width, 'image.width', 1, 32768)
  number(ref.height, 'image.height', 1, 32768)
  choice(ref.format, 'image.format', ['png', 'jpeg', 'webp', 'svg'])
}
export function validateBackground(value: unknown): CardBackground {
  const bg = readJsonObject(value, 'background')
  choice(bg.kind, 'background.kind', ['transparent', 'solid', 'linear', 'radial', 'freeform', 'image', 'blurred'])
  color(bg.color, 'background.color')
  const linear = readJsonObject(bg.linear, 'linear')
  stops(linear.stops, 'linear.stops')
  point(linear.start, 'linear.start', 0, 1)
  point(linear.end, 'linear.end', 0, 1)
  if (JSON.stringify(linear.start) === JSON.stringify(linear.end)) throw new Error('composition gradient direction is empty')
  const radial = readJsonObject(bg.radial, 'radial')
  stops(radial.stops, 'radial.stops')
  point(radial.center, 'radial.center', 0, 1)
  number(radial.radius, 'radial.radius', 0.01, 4)
  validateFreeform(bg.freeform)
  image(bg.image)
  choice(bg.fit, 'background.fit', ['contain', 'cover'])
  number(bg.scale, 'background.scale', 0.01, 16)
  point(bg.offset, 'background.offset')
  number(bg.blur, 'background.blur', 0, 128)
  return value as CardBackground
}
function validateFreeform(value: unknown): void {
  const f = readJsonObject(value, 'freeform')
  if (
    f.version !== 1 ||
    !Array.isArray(f.points) ||
    f.points.length < 2 ||
    f.points.length > 16
  ) throw new Error('composition freeform requires 2–16 points')
  const ids = new Set<string>()
  for (const raw of f.points) {
    const p = readJsonObject(raw, 'freeform.point')
    string(p.id, 'freeform.point.id')
    if (!p.id || ids.has(p.id as string)) throw new Error('composition duplicate point')
    ids.add(p.id as string)
    point(p, 'freeform.point', 0, 1)
    color(p.color, 'freeform.point.color')
    number(p.radius, 'freeform.point.radius', 0.01, 4)
  }
}
function validateBranding(value: unknown): CardBranding {
  const b = readJsonObject(value, 'branding')
  string(b.id, 'branding.id')
  string(b.text, 'branding.text')
  string(b.template, 'branding.template')
  string(b.fontFamily, 'branding.fontFamily')
  choice(b.textAlignment, 'branding.textAlignment', ['start', 'center', 'end'])
  number(b.year, 'branding.year', 1, 9999)
  image(b.image)
  number(b.imageSize, 'branding.imageSize', 1, 4096)
  choice(b.region, 'branding.region', ['content', 'card', 'header', 'footer'])
  point(b.alignment, 'branding.alignment', 0, 1)
  point(b.offset, 'branding.offset')
  number(b.fontSize, 'branding.fontSize', 6, 512)
  color(b.color, 'branding.color')
  number(b.opacity, 'branding.opacity', 0, 1)
  number(b.padding, 'branding.padding', 0, 4096)
  if (b.backplate !== null) color(b.backplate, 'branding.backplate')
  return value as CardBranding
}
function validateLayout(layout: Obj): void {
  choice(layout.mode, 'layout.mode', ['auto', 'fixed'])
  number(layout.width, 'layout.width', 1, 32768)
  number(layout.height, 'layout.height', 1, 32768)
  const insets = readJsonObject(layout.insets, 'insets')
  choice(insets.unit, 'insets.unit', ['px', 'percent'])
  if (typeof insets.linked !== 'boolean') throw new Error('composition insets.linked is invalid')
  for (const side of ['top', 'right', 'bottom', 'left']) number(insets[side], `insets.${side}`, 0, insets.unit === 'px' ? 8192 : 200)
  point(layout.alignment, 'layout.alignment', 0, 1)
  point(layout.offset, 'layout.offset')
  number(layout.scale, 'layout.scale', 0.01, 16)
}
function validateFrame(value: unknown): void {
  const f = readJsonObject(value, 'frame')
  choice(f.kind, 'frame.kind', ['none', 'window', 'browser', 'phone'])
  choice(f.theme, 'frame.theme', ['light', 'dark'])
  choice(f.orientation, 'frame.orientation', ['portrait', 'landscape'])
  choice(f.fit, 'frame.fit', ['contain', 'cover'])
  string(f.title, 'frame.title')
  string(f.url, 'frame.url')
  color(f.screenColor, 'frame.screenColor')
  number(f.zoom, 'frame.zoom', 0.01, 16)
  point(f.offset, 'frame.offset')
}
export function parseComposition(value: unknown): CompositionSettings {
  const input = readJsonObject(value, 'composition')
  if (input.version !== 1) throw new Error('composition version is unsupported')
  validateLayout(readJsonObject(input.layout, 'layout'))
  validateFrame(input.frame)
  validateBackground(input.background)
  for (const name of ['header', 'footer']) {
    const band = readJsonObject(input[name], name)
    number(band.height, `${name}.height`, 0, 8192)
    validateBackground(band.fill)
  }
  number(input.radius, 'radius', 0, 4096)
  number(input.shadow, 'shadow', 0, 1)
  if (input.shadowOptions !== undefined) {
    const shadow = readJsonObject(input.shadowOptions, 'shadowOptions')
    number(shadow.size, 'shadowOptions.size', 0.25, 4)
    number(shadow.softness, 'shadowOptions.softness', 0.1, 2)
    number(shadow.spread, 'shadowOptions.spread', -128, 256)
    point(shadow.offset, 'shadowOptions.offset', -1024, 1024)
    color(shadow.color, 'shadowOptions.color')
  }
  if (!Array.isArray(input.branding) || input.branding.length > 64) throw new Error('composition branding is invalid')
  const blocks = input.branding.map(validateBranding)
  if (new Set(blocks.map((b) => b.id)).size !== blocks.length) throw new Error('composition duplicate branding id')
  return freezeJsonObject(input, 'composition') as unknown as CompositionSettings
}
