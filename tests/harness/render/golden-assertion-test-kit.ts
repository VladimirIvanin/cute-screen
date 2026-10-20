import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { expect } from 'vitest'
import {
  compareRgba,
  type GoldenTolerance,
} from './golden'
import { goldenRoot } from './golden-runtime-test-kit'

export async function rgba(png: Uint8Array): Promise<Uint8Array> {
  const image = await loadImage(png)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return new Uint8Array(context.getImageData(0, 0, image.width, image.height).data)
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
  tolerance: GoldenTolerance = { maximumChangedChannelRatio: 0, maximumDelta: 0 },
): Promise<void> {
  const file = path.join(goldenRoot, `${name}.png`)
  if (process.env.CUTE_SCREEN_UPDATE_GOLDENS === '1') {
    await mkdir(goldenRoot, { recursive: true })
    const previous = await readFile(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    // Preserve untouched baselines and avoid reopening identical PNGs for writing.
    if (!previous || !previous.equals(actual)) await writeFile(file, actual)
  }
  const expected = new Uint8Array(await readFile(file))
  const actualPixels = await rgba(actual)
  const expectedPixels = await rgba(expected)
  const difference = compareRgba(actualPixels, expectedPixels)
  expect(difference.maximumDelta, `${name}: maximum channel delta`).toBeLessThanOrEqual(tolerance.maximumDelta)
  expect(difference.changedChannels / actualPixels.length, `${name}: changed channel ratio`)
    .toBeLessThanOrEqual(tolerance.maximumChangedChannelRatio)
  if (tolerance.maximumDelta > 0) {
    let changedAlphaChannels = 0
    for (let index = 3; index < actualPixels.length; index += 4) {
      if (actualPixels[index] !== expectedPixels[index]) changedAlphaChannels += 1
    }
    expect(changedAlphaChannels, `${name}: alpha`).toBe(0)
  }
}
