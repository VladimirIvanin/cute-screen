import { describe, expect, it, vi } from 'vitest'

import { writeResultCanvasToClipboard } from '../../../apps/desktop/src/result-clipboard'

describe('result clipboard', () => {
  it('writes the rendered scene as raw PNG bytes through the native clipboard', async () => {
    const blob = new Blob(['rendered PNG'], { type: 'image/png' })
    const canvas = {
      toBlob: vi.fn((callback: BlobCallback, type?: string) => {
        expect(type).toBe('image/png')
        callback(blob)
      }),
    } as unknown as HTMLCanvasElement
    const writePng = vi.fn().mockResolvedValue(undefined)

    await writeResultCanvasToClipboard(canvas, {
      writePng,
    })

    expect(writePng).toHaveBeenCalledWith(
      new Uint8Array(await blob.arrayBuffer()),
    )
  })

  it('reports when PNG encoding is unavailable instead of copying the original image', async () => {
    const canvas = {
      toBlob: (callback: BlobCallback) => callback(null),
    } as unknown as HTMLCanvasElement

    await expect(
      writeResultCanvasToClipboard(canvas, {
        writePng: vi.fn(),
      }),
    ).rejects.toThrow('PNG encoding failed')
  })
})
