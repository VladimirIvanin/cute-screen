import { describe, expect, it, vi } from 'vitest'

import {
  ImageResourceManager,
  selectImageVariant,
} from './image-resource-manager'

describe('M03 image resource manager', () => {
  it('deduplicates concurrent decodes and evicts unused least-recent resources', async () => {
    const dispose = vi.fn()
    const load = vi.fn(async () => ({
      value: { image: true },
      byteSize: 80,
      dispose,
    }))
    const manager = new ImageResourceManager({ byteBudget: 100, load })
    const key = {
      blobHash: 'a'.repeat(64),
      variant: 'interactive-2048' as const,
      colorProfile: 'srgb',
    }
    const leases = await Promise.all(
      Array.from({ length: 20 }, () => manager.acquire(key)),
    )
    expect(load).toHaveBeenCalledTimes(1)
    for (const lease of leases) lease.release()
    const other = await manager.acquire({ ...key, blobHash: 'b'.repeat(64) })
    other.release()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(manager.bytesInUse).toBe(80)
  })

  it('uses a preview for fit and a texture limit', () => {
    expect(
      selectImageVariant({
        width: 7680,
        height: 4320,
        zoom: 0.2,
        maxTextureSize: 16384,
      }),
    ).toMatchObject({ variant: 'interactive-2048', reason: 'fitPreview' })
    expect(
      selectImageVariant({
        width: 9000,
        height: 100,
        zoom: 2,
        maxTextureSize: 4096,
      }),
    ).toMatchObject({ variant: 'interactive-2048', reason: 'textureLimit' })
    expect(
      selectImageVariant({
        width: 1000,
        height: 500,
        zoom: 2,
        maxTextureSize: 4096,
      }),
    ).toMatchObject({ variant: 'original' })
  })
})
