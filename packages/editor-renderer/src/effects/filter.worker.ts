import {
  processPixels,
  type PixelJob,
} from './runtime'

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<PixelJob>) => void) | null
  postMessage(value: unknown, transfer: Transferable[]): void
}
scope.onmessage = ({ data: job }) => {
  processPixels(job)
  scope.postMessage(job.image.data, [job.image.data.buffer as ArrayBuffer])
}
