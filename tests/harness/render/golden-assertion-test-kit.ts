import { createCanvas, loadImage } from '@napi-rs/canvas'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect } from 'vitest'
import { compareRgba } from './golden'
import { goldenRoot } from './golden-runtime-test-kit'

export async function rgba(png: Uint8Array): Promise<Uint8Array> {
  const image = await loadImage(png)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return new Uint8Array(
    context.getImageData(0, 0, image.width, image.height).data,
  )
}

export function alphaBounds(
  pixels: Uint8Array,
  width: number,
  height: number,
): Readonly<{ left: number; top: number; right: number; bottom: number }> {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((pixels[(y * width + x) * 4 + 3] ?? 0) === 0) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < 0) throw new Error('expected non-transparent renderer output')
  return { left, top, right, bottom }
}

export async function assertGolden(
  name: string,
  actual: Uint8Array,
): Promise<void> {
  const file = path.join(goldenRoot, `${name}.png`)
  if (process.env.CUTE_SCREEN_UPDATE_GOLDENS === '1') {
    await mkdir(goldenRoot, { recursive: true })
    await writeFile(file, actual)
  }
  const expected = new Uint8Array(await readFile(file))
  expect(compareRgba(await rgba(actual), await rgba(expected))).toEqual({
    changedChannels: 0,
    maximumDelta: 0,
  })
}
