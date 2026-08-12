import { describe, expect, it, vi } from 'vitest'

import { writeResultCanvasToClipboard } from '../../../apps/desktop/src/result-clipboard'

describe('result clipboard', () => {
  it('writes the rendered scene as an image/png clipboard item', async () => {
    const blob = new Blob(['rendered PNG'], { type: 'image/png' })
    const canvas = {
      toBlob: vi.fn((callback: BlobCallback, type?: string) => {
        expect(type).toBe('image/png')
        callback(blob)
      }),
    } as unknown as HTMLCanvasElement
    const createItem = vi.fn((items: Record<string, Blob>) => ({ items }))
    const write = vi.fn().mockResolvedValue(undefined)

    await writeResultCanvasToClipboard(canvas, {
      clipboard: { write },
      createItem,
    })

    expect(write).toHaveBeenCalledWith([{ items: { 'image/png': blob } }])
  })

  it('reports when PNG encoding is unavailable instead of copying the original image', async () => {
    const canvas = {
      toBlob: (callback: BlobCallback) => callback(null),
    } as unknown as HTMLCanvasElement

    await expect(
      writeResultCanvasToClipboard(canvas, {
        clipboard: { write: vi.fn() },
        createItem: vi.fn(),
      }),
    ).rejects.toThrow('PNG encoding failed')
  })
})
