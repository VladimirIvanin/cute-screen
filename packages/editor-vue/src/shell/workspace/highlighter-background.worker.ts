import { classifyHighlighterBackground } from '@cute-screen/editor-renderer'

self.onmessage = async (event: MessageEvent<{ source: Blob | string; width: number; height: number }>) => {
  let bitmap: ImageBitmap | undefined
  try {
    const { source, width, height } = event.data
    let blob: Blob
    if (typeof source === 'string') {
      const response = await fetch(source)
      if (!response.ok) throw new Error(`Original image read failed: ${response.status}`)
      blob = await response.blob()
    } else blob = source
    bitmap = await createImageBitmap(blob, { resizeWidth: width, resizeHeight: height, resizeQuality: 'pixelated' })
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('OffscreenCanvas 2D context unavailable')
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    self.postMessage({ effect: classifyHighlighterBackground(pixels) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) })
  } finally {
    bitmap?.close()
  }
}
