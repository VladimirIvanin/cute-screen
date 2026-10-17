import type { EditorDocumentV1 } from '@cute-screen/editor-renderer'
import { renderHistoryThumbnail } from './thumbnail-render'

export interface ThumbnailJob {
  document: EditorDocumentV1
  images: Array<{ hash: string; blob: Blob }>
  fonts: Array<{ family: string; source: string; weight: string; style: string; unicodeRange: string }>
}
self.onmessage = async (event: MessageEvent<ThumbnailJob>) => {
  const images = new Map<string, ImageBitmap>()
  try {
    const fonts = (self as unknown as { fonts: FontFaceSet }).fonts
    for (const value of event.data.fonts) {
      const descriptors = { weight: value.weight, style: value.style, unicodeRange: value.unicodeRange }
      const face = new FontFace(value.family, value.source, descriptors)
      fonts.add(await face.load())
    }
    for (const value of event.data.images) images.set(value.hash, await createImageBitmap(value.blob))
    const canvas = new OffscreenCanvas(1, 1)
    const target = canvas as unknown as HTMLCanvasElement
    const overlay = new OffscreenCanvas(1, 1) as unknown as HTMLCanvasElement
    await renderHistoryThumbnail(event.data.document, images, target, overlay)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    self.postMessage({ bytes: await blob.arrayBuffer() })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) })
  } finally {
    for (const image of images.values()) image.close()
  }
}
