import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { readFile } from 'node:fs/promises'
import { assertGolden } from './golden-assertion-test-kit'
import {
  compositionCanvas2dTolerance,
  mockupCanvas2dTolerance,
} from './golden'

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  readFile: vi.fn(),
}))

async function png(changes: readonly (readonly [number, number])[] = []): Promise<Uint8Array> {
  const canvas = createCanvas(250, 100)
  const context = canvas.getContext('2d')
  context.fillStyle = 'rgb(100, 100, 100)'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  for (const [index, delta] of changes) pixels.data[index] = pixels.data[index]! + delta
  context.putImageData(pixels, 0, 0)
  return canvas.encode('png')
}

beforeEach(async () => {
  vi.stubEnv('CUTE_SCREEN_UPDATE_GOLDENS', '0')
  vi.mocked(readFile).mockResolvedValue(Buffer.from(await png()))
})

afterEach(() => vi.unstubAllEnvs())

describe.each([
  { name: 'composition', tolerance: compositionCanvas2dTolerance, maximumChannels: 2 },
  { name: 'mockup', tolerance: mockupCanvas2dTolerance, maximumChannels: 7 },
])('$name golden assertion rounding budget', ({ tolerance, maximumChannels }) => {
  const changes = (count: number) => Array.from({ length: count }, (_, index) => [index * 4, 1] as const)

  it('requires exact RGBA by default', async () => {
    await assertGolden('exact', await png())
    await expect(assertGolden('exact', await png([[0, 1]]))).rejects.toThrow('exact: maximum channel delta')
  })

  it('accepts a sparse one-level RGB rounding difference when explicitly enabled', async () => {
    await assertGolden('rounding', await png(changes(maximumChannels)), tolerance)
  })

  it('rejects a single channel beyond the one-level cap', async () => {
    await expect(assertGolden('contrast', await png([[0, 2]]), tolerance))
      .rejects.toThrow('contrast: maximum channel delta')
  })

  it('rejects one-level changes beyond the sparse-change budget', async () => {
    await expect(assertGolden('widespread', await png(changes(maximumChannels + 1)), tolerance))
      .rejects.toThrow('widespread: changed channel ratio')
  })

  it('requires exact alpha even within the RGB rounding budget', async () => {
    await expect(assertGolden('alpha', await png([[3, -1]]), tolerance))
      .rejects.toThrow('alpha: alpha')
  })
})
