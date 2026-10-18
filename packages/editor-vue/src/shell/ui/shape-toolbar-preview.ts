import {
  shapeGeometry,
  shapePathSvg,
  mapShapePath,
  type ShapePreset,
  type SrgbColor,
} from '@cute-screen/editor-renderer'
import type { ShapeFill } from '../types'

export function thumbnail(entry: ShapePreset): string {
  const geometry = shapeGeometry(
    entry.shape,
    24,
    entry.shape === 'oval' ? 16 : 24,
    { cornerRadius: entry.cornerRadius ? 5 : 0 },
  )
  return shapePathSvg(mapShapePath([...geometry.outline, ...geometry.details], 1, 1, 4, entry.shape === 'oval' ? 8 : 4))
}
export function gridKeydown(event: KeyboardEvent): void {
  const grid = event.currentTarget as HTMLElement
  const buttons = Array.from(grid.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
  const index = buttons.indexOf(event.target as HTMLButtonElement)
  if (index < 0) return
  const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 7
  const movement: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }
  if (
    !(event.key in movement) &&
    event.key !== 'Home' &&
    event.key !== 'End'
  ) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + movement[event.key]!))
  buttons[next]?.focus()
}
function paintColor(
  color: SrgbColor,
  opacity: number,
): string {
  return `rgba(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)}, ${color.alpha * opacity})`
}
export function fillBackground(paint: ShapeFill | null): string {
  if (
    !paint ||
    paint.kind === 'none' ||
    paint.kind === 'imageTexture'
  ) return ''
  if (paint.kind === 'solid') return paintColor(paint.color, paint.opacity)
  if (paint.kind === 'pattern') {
    const foreground = paintColor(paint.color, paint.opacity)
    const background = paintColor(paint.background, paint.opacity)
    if (paint.pattern === 'dots')
      return `radial-gradient(${foreground} 20%, transparent 25%) 0 0 / 6px 6px ${background}`
    if (paint.pattern === 'grid')
      return `repeating-linear-gradient(0deg, ${foreground} 0 1px, transparent 1px 6px), repeating-linear-gradient(90deg, ${foreground} 0 1px, ${background} 1px 6px)`
    return `repeating-linear-gradient(45deg, ${foreground} 0 2px, ${background} 2px 6px)`
  }
  const stops = paint.stops.map((stop) => `${paintColor(stop.color, paint.opacity)} ${stop.position * 100}%`).join(', ')
  if (paint.kind === 'radialGradient') return `radial-gradient(circle, ${stops})`
  const angle = Math.atan2(paint.end.y - paint.start.y, paint.end.x - paint.start.x) * 180 / Math.PI + 90
  return `linear-gradient(${angle}deg, ${stops})`
}
