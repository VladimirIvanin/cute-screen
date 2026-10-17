import { ImageResourceManager } from '@cute-screen/editor-vue'
import {
  loadImageWithBinaryFallback,
  type ImageTransportBridge,
} from '@cute-screen/editor-vue'

/** Original decodes are deduplicated and bounded independently of Vue state. */
export function historyImages(bridge: ImageTransportBridge) {
  const tokens = new Map<string, string>()
  const manager = new ImageResourceManager<HTMLImageElement>({
    byteBudget: 256 * 1024 * 1024,
    load: async (key) => {
      const token = tokens.get(key.blobHash)
      if (!token) throw new Error('Image transport token expired')
      const loaded = await loadImageWithBinaryFallback({ token, correlationId: 'history-image', bridge, createResource: async (image) => image })
      const image = loaded.resource
      return { value: image, byteSize: image.naturalWidth * image.naturalHeight * 4, dispose: () => {
        image.src = ''
      } }
    },
  })
  return {
    acquire: async (hash: string, token: string) => {
      tokens.set(hash, token)
      try {
        return await manager.acquire({ blobHash: hash, variant: 'original', colorProfile: 'srgb' })
      } finally {
        tokens.delete(hash)
      }
    },
    dispose: () => manager.dispose(),
  }
}
