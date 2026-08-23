import { describe, expect, it, vi } from 'vitest'

import {
  ImageTransportError,
  loadImageWithBinaryFallback,
  type ImageTransportBridge,
} from '@cute-screen/editor-vue'

const metadata = {
  token: 'm01-alpha-png',
  assetUrl: 'asset://localhost/m01-alpha-png.png',
  mimeType: 'image/png',
  width: 64,
  height: 64,
  sha256: 'a'.repeat(64),
  correlationId: 'transport-test',
} as const

function bridge(): ImageTransportBridge {
  return {
    stageImage: vi.fn().mockResolvedValue(metadata),
    readImageBytes: vi
      .fn()
      .mockResolvedValue(Uint8Array.from([137, 80, 78, 71]).buffer),
  }
}

function decodedImage(): HTMLImageElement {
  return { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement
}

describe('image transport', () => {
  it('keeps the scoped asset URL as the primary path', async () => {
    const adapter = bridge()
    const resource = { id: 'resource', dispose: vi.fn() }
    const result = await loadImageWithBinaryFallback({
      token: metadata.token,
      correlationId: metadata.correlationId,
      bridge: adapter,
      decodeImage: vi.fn().mockResolvedValue(decodedImage()),
      createResource: vi.fn().mockResolvedValue(resource),
      objectUrls: {
        create: vi.fn(),
        revoke: vi.fn(),
      },
    })

    expect(result.transport).toBe('asset')
    expect(adapter.readImageBytes).not.toHaveBeenCalled()
  })

  it('uses raw binary IPC and revokes its Blob URL exactly once', async () => {
    const adapter = bridge()
    const revoke = vi.fn()
    const decodeImage = vi
      .fn()
      .mockRejectedValueOnce(new Error('asset denied'))
      .mockResolvedValueOnce(decodedImage())
    const result = await loadImageWithBinaryFallback({
      token: metadata.token,
      correlationId: metadata.correlationId,
      bridge: adapter,
      decodeImage,
      createResource: vi
        .fn()
        .mockResolvedValue({ id: 'resource', dispose: vi.fn() }),
      objectUrls: {
        create: vi.fn().mockReturnValue('blob:m01'),
        revoke,
      },
    })

    expect(result.transport).toBe('binary')
    expect(adapter.readImageBytes).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:m01')
  })

  it('loads a native memory preview without attempting an asset URL', async () => {
    const adapter = bridge()
    vi.mocked(adapter.stageImage).mockResolvedValue({
      ...metadata,
      assetUrl: '',
      mimeType: 'image/bmp',
    })
    const decodeImage = vi.fn().mockResolvedValue(decodedImage())
    const result = await loadImageWithBinaryFallback({
      token: metadata.token,
      correlationId: metadata.correlationId,
      bridge: adapter,
      decodeImage,
      createResource: vi
        .fn()
        .mockResolvedValue({ id: 'resource', dispose: vi.fn() }),
      objectUrls: {
        create: vi.fn().mockReturnValue('blob:memory-preview'),
        revoke: vi.fn(),
      },
    })

    expect(result.transport).toBe('binary')
    expect(decodeImage).toHaveBeenCalledExactlyOnceWith('blob:memory-preview')
  })

  it('revokes the Blob URL and returns a typed corrupt-image error', async () => {
    const revoke = vi.fn()
    await expect(
      loadImageWithBinaryFallback({
        token: metadata.token,
        correlationId: metadata.correlationId,
        bridge: bridge(),
        decodeImage: vi.fn().mockRejectedValue(new Error('decode failed')),
        createResource: vi.fn(),
        objectUrls: {
          create: vi.fn().mockReturnValue('blob:broken'),
          revoke,
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'imageCorrupt',
        correlationId: metadata.correlationId,
      }) as ImageTransportError,
    )
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:broken')
  })
})
