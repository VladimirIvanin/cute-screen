import {
  Canvas2DRenderer,
  createDocumentRenderScene,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import { documentEmojiImages } from '../emoji/resources'

/** Same saved-scene contract as the editor; overlays and selection never enter previews. */
export async function renderHistoryThumbnail(
  document: EditorDocumentV1,
  images: ReadonlyMap<string, HTMLImageElement | ImageBitmap>,
  canvas: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
): Promise<void> {
  const renderer = new Canvas2DRenderer()
  try {
    await renderer.initialize({ scene: canvas, overlay, dpr: 1, correlationId: 'history-preview' })
    const resources = new Map([...images, ...await documentEmojiImages(document, images)])
    for (const [id, image] of resources) {
      const width = 'naturalWidth' in image ? image.naturalWidth : image.width
      const height = 'naturalHeight' in image ? image.naturalHeight : image.height
      await renderer.createImageResource({ id, width, height, source: image })
    }
    const scene = createDocumentRenderScene(document)
    renderer.setPreviewScale(Math.min(1, 256 / Math.max(scene.outputBounds.width, scene.outputBounds.height)))
    renderer.setScene(scene)
    renderer.render(['scene'])
  } finally {
    renderer.dispose()
  }
}
