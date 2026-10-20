import {
  rasterizeFreeform,
  type FreeformPoint,
} from '@cute-screen/editor-core'
self.onmessage = (event: MessageEvent<{ points: readonly FreeformPoint[]; width: number; height: number }>) => {
  const { points, width, height } = event.data
  // Bounded row tiles make cancellation independent of the full export cost.
  const rows = Math.max(1, Math.min(128, Math.floor(262144 / width)))
  for (let start = 0; start < height; start += rows) {
    const count = Math.min(rows, height - start)
    const bytes = rasterizeFreeform(points, width, height, start, count)
    self.postMessage({ bytes, start, count, progress: (start + count) / height }, { transfer: [bytes.buffer] })
  }
}
