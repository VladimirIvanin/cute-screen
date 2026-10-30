import type {
  Point,
  Rect,
} from '../document/types'
import type {
  CardFrame,
  PhoneModel,
} from './types'
import type { ShapePathCommand } from '../shape-path-types'

export const PHONE_MODELS = [
  { id: 'iphone-island', ru: 'iPhone · островок', en: 'iPhone · Island', radius: 0.13, camera: 'island' },
  { id: 'iphone-notch', ru: 'iPhone · чёлка', en: 'iPhone · Notch', radius: 0.09, camera: 'notch' },
  { id: 'android-rounded', ru: 'Android · округлый', en: 'Android · Rounded', radius: 0.115, camera: 'center' },
  { id: 'android-angular', ru: 'Android · угловатый', en: 'Android · Angular', radius: 0.035, camera: 'left' },
] as const
export const BROWSER_STYLES = [
  { id: 'modern', ru: 'Современный', en: 'Modern', chrome: 40 },
  { id: 'retro-windows', ru: 'Windows 95/98', en: 'Windows 95/98', chrome: 92 },
  { id: 'retro-mac', ru: 'Macintosh', en: 'Macintosh', chrome: 76 },
] as const

export function phoneModel(frame: Pick<CardFrame, 'phoneModel'>) {
  return PHONE_MODELS.find((model) => model.id === frame.phoneModel) ?? PHONE_MODELS[0]
}
export function browserChrome(frame: CardFrame): number {
  if (frame.kind === 'none') return 0
  return frame.kind === 'browser'
    ? (BROWSER_STYLES.find((style) => style.id === frame.browserStyle) ?? BROWSER_STYLES[0]).chrome : 40
}
export function phoneScreenRadius(
  frame: CardFrame,
  screen: Rect,
): number {
  return Math.min(screen.width, screen.height) * phoneModel(frame).radius
}

/** Hardware coordinates rotate with the body; screenshot coordinates never rotate. */
export function phoneHardwareRect(
  frame: CardFrame,
  screen: Rect,
  rect: Rect,
): Rect {
  const edge = Math.min(screen.width, screen.height)
  if (frame.orientation === 'portrait') return {
    x: screen.x + rect.x * edge, y: screen.y + rect.y * edge,
    width: rect.width * edge, height: rect.height * edge,
  }
  return { x: screen.x + rect.y * edge, y: screen.y + (1 - rect.x - rect.width) * edge,
    width: rect.height * edge, height: rect.width * edge }
}
export function phoneCamera(
  frame: CardFrame,
  screen: Rect,
): Rect {
  const camera = phoneModel(frame).camera
  const rect = camera === 'island' ? { x: 0.35, y: 0.026, width: 0.3, height: 0.078 }
    : camera === 'notch' ? { x: 0.27, y: -0.003, width: 0.46, height: 0.09 }
      : { x: camera === 'left' ? 0.065 : 0.477, y: 0.033, width: 0.046, height: 0.046 }
  return phoneHardwareRect(frame, screen, rect)
}
export function phoneCameraRadius(
  frame: CardFrame,
  screen: Rect,
): number {
  const bounds = phoneCamera(frame, screen)
  return phoneModel(frame).camera === 'notch' ? Math.min(screen.width, screen.height) * 0.035
    : Math.min(bounds.width, bounds.height) / 2
}

/** The attached top edge has square corners; only the two free corners curve. */
export function phoneNotchPath(
  frame: CardFrame,
  screen: Rect,
): readonly ShapePathCommand[] {
  const unit = { x: 0, y: 0, width: 1, height: 1 }
  const normalized = phoneCamera({ ...frame, orientation: 'portrait' }, unit)
  const left = normalized.x, right = normalized.x + normalized.width
  const top = normalized.y, bottom = normalized.y + normalized.height
  const radius = phoneCameraRadius(frame, unit)
  const k = 0.5522847498307936
  const path: readonly ShapePathCommand[] = [
    ['M', left, top], ['L', right, top], ['L', right, bottom - radius],
    ['C', right, bottom - radius + radius * k, right - radius + radius * k, bottom, right - radius, bottom],
    ['L', left + radius, bottom],
    ['C', left + radius - radius * k, bottom, left, bottom - radius + radius * k, left, bottom - radius],
    ['Z'],
  ]
  const point = (x: number, y: number) => phoneHardwareRect(frame, screen, { x, y, width: 0, height: 0 })
  return path.map((command): ShapePathCommand => {
    if (command[0] === 'Z') return command
    const start = point(command[1], command[2])
    if (command[0] !== 'C') return [command[0], start.x, start.y]
    const middle = point(command[3], command[4])
    const end = point(command[5], command[6])
    return ['C', start.x, start.y, middle.x, middle.y, end.x, end.y]
  })
}

export function phoneCameraContains(
  frame: CardFrame,
  screen: Rect,
  point: Point,
): boolean {
  const camera = phoneCamera(frame, screen)
  const radius = phoneCameraRadius(frame, screen)
  if (!insideRoundedRect(point, camera)) return false
  if (phoneModel(frame).camera === 'notch') {
    const joined = frame.orientation === 'portrait' ? point.y <= camera.y + radius : point.x <= camera.x + radius
    if (joined) return true
  }
  return insideRoundedRect(point, camera, radius)
}
export function phoneViewport(
  frame: CardFrame,
  screen: Rect,
): Rect {
  if (frame.phoneContentMode === 'fullscreen') return screen
  const edge = Math.min(screen.width, screen.height)
  const camera = phoneModel(frame).camera
  const cameraInset = camera === 'island' ? 0.12 : camera === 'notch' ? 0.105 : 0.095
  const landscape = frame.orientation === 'landscape'
  const left = (landscape ? cameraInset : 0.045) * edge
  const top = (landscape ? frame.phoneSystemDetails ? 0.095 : 0.05
    : Math.max(cameraInset, frame.phoneSystemDetails ? 0.12 : 0)) * edge
  const right = 0.045 * edge
  const bottom = (frame.phoneSystemDetails ? 0.075 : 0.05) * edge
  return { x: screen.x + left, y: screen.y + top,
    width: Math.max(1, screen.width - left - right), height: Math.max(1, screen.height - top - bottom) }
}
export function insideRoundedRect(
  point: Point,
  rect: Rect,
  radius = 0,
): boolean {
  if (
    point.x < rect.x ||
    point.y < rect.y ||
    point.x > rect.x + rect.width ||
    point.y > rect.y + rect.height
  ) return false
  const x = Math.max(rect.x + radius, Math.min(point.x, rect.x + rect.width - radius))
  const y = Math.max(rect.y + radius, Math.min(point.y, rect.y + rect.height - radius))
  return (point.x - x) ** 2 + (point.y - y) ** 2 <= radius ** 2
}
export function isPhoneModel(value: string): value is PhoneModel {
  return PHONE_MODELS.some((model) => model.id === value)
}
