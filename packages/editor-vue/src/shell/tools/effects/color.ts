import type { SrgbColor } from '@cute-screen/editor-renderer'

export function parseHexColor(value: string): SrgbColor | undefined {
  const match = /^#([0-9a-f]{6})$/iu.exec(value)
  if (!match) return undefined
  const hex = match[1]!
  return {
    red: Number.parseInt(hex.slice(0, 2), 16) / 255,
    green: Number.parseInt(hex.slice(2, 4), 16) / 255,
    blue: Number.parseInt(hex.slice(4, 6), 16) / 255,
    alpha: 1,
  }
}
