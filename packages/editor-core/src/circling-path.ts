import {
  fitSketchPath,
  sketchRandom,
  smoothSketchPath,
} from './sketch-geometry'
import type { ShapePathCommand } from './shape-path-types'

/** Owner-selected smooth loops, reproduced from the review prototype. */
export function circlingPath(
  width: number,
  height: number,
  seed: number,
): readonly ShapePathCommand[] {
  if (seed === 97531) return referenceCirclingPath(width, height)
  const random = sketchRandom(seed)
  const start = -Math.PI + random() * Math.PI
  const direction = random() > 0.5 ? 1 : -1
  const phase = random() * 2 * Math.PI
  const asymmetry = 0.035 + random() * 0.035
  const shear = (random() - 0.5) * 0.28
  const overlap = 0.26 + random() * 0.34
  const separation = 0.045 + random() * 0.05
  const tilt = (random() - 0.5) * 0.09
  const points = Array.from({ length: 65 }, (_, index) => {
    const t = index / 64
    const angle = start + direction * (Math.PI * 2 + overlap) * t
    const radius = 1 + asymmetry * Math.sin(angle + phase)
      + 0.028 * Math.cos(2 * angle - phase)
      + 0.018 * Math.sin(3 * angle + phase)
      + separation * t * t
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    return { x: x + shear * y, y: y + tilt * x }
  })
  return fitSketchPath(smoothSketchPath(points), width, height)
}

/** Slanted reference loop: outer starting sweep, inner return and a long top overlap. */
function referenceCirclingPath(
  width: number,
  height: number,
): readonly ShapePathCommand[] {
  const points = Array.from({ length: 65 }, (_, index) => {
    const t = index / 64
    const angle = -0.88 - (Math.PI * 2 + 0.68) * t
    const radius = 1.14 - 0.25 * t + 0.02 * Math.sin(2 * angle + 0.4)
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    return { x: x + 0.15 * y, y: y - 0.23 * x }
  })
  return fitSketchPath(smoothSketchPath(points), width, height)
}
