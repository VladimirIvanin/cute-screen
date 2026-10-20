import {
  rasterizeFreeform,
  type RenderNode,
  type RenderSceneSnapshot,
} from '@cute-screen/editor-core'
type Freeform = Extract<RenderNode, { kind: 'freeform' }>
const cache = new Map<string, Uint8ClampedArray>()
let byteSize = 0
function key(
  node: Freeform,
  width: number,
  height: number,
): string {
  return `${width}:${height}:${JSON.stringify(node.points)}`
}
function remember(
  id: string,
  bytes: Uint8ClampedArray,
): Uint8ClampedArray {
  if (cache.has(id)) return cache.get(id)!
  while (byteSize + bytes.byteLength > 64 * 1024 * 1024 && cache.size) {
    const oldest = cache.keys().next().value!
    byteSize -= cache.get(oldest)!.byteLength
    cache.delete(oldest)
  }
  cache.set(id, bytes)
  byteSize += bytes.byteLength
  return bytes
}
export function freeformPixels(
  node: Freeform,
  width: number,
  height: number,
): Uint8ClampedArray {
  const id = key(node, width, height)
  return cache.get(id) ?? remember(id, rasterizeFreeform(node.points, width, height))
}
async function prepareNode(
  node: Freeform,
  scale: number,
  signal?: AbortSignal,
  progress?: (fraction: number) => void,
): Promise<void> {
  const width = Math.max(1, Math.round(node.bounds.width * scale))
  const height = Math.max(1, Math.round(node.bounds.height * scale))
  const id = key(node, width, height)
  if (cache.has(id)) return
  if (typeof Worker === 'undefined') {
    freeformPixels(node, width, height)
    return
  }
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL('./freeform.worker.js', import.meta.url), { type: 'module' })
    const finish = () => {
      worker.terminate()
      signal?.removeEventListener('abort', abort)
    }
    const abort = () => {
      finish()
      reject(new DOMException('Gradient cancelled', 'AbortError'))
    }
    const output = new Uint8ClampedArray(width * height * 4)
    worker.onmessage = (event: MessageEvent<{ bytes: Uint8ClampedArray; start: number; progress: number }>) => {
      output.set(event.data.bytes, event.data.start * width * 4)
      progress?.(event.data.progress)
      if (event.data.progress < 1) return
      remember(id, output)
      finish()
      resolve()
    }
    worker.onerror = (event) => {
      finish()
      reject(new Error(event.message || 'Gradient worker failed'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
      return
    }
    worker.postMessage({ points: node.points, width, height })
  })
}
export async function prepareCompositionScene(
  scene: RenderSceneSnapshot,
  scale = 1,
  signal?: AbortSignal,
  progress?: (fraction: number) => void,
): Promise<void> {
  if (signal?.aborted) throw new DOMException('Gradient cancelled', 'AbortError')
  const jobs = freeformJobs(scene, scale)
  for (let index = 0; index < jobs.length; index++) {
    if (signal?.aborted) throw new DOMException('Gradient cancelled', 'AbortError')
    const job = jobs[index]!
    await prepareNode(job.node,
      job.scale,
      signal,
      progress ? (fraction) => progress((index + fraction) / jobs.length) : undefined)
    progress?.((index + 1) / jobs.length)
  }
}
function freeformJobs(
  scene: RenderSceneSnapshot,
  scale: number,
): Array<{ node: Freeform; scale: number }> {
  return scene.nodes.flatMap((node) => {
    if (node.kind === 'freeform') return [{ node, scale }]
    if (node.kind === 'group') return freeformJobs(node.scene, scale * node.destination.width / node.scene.outputBounds.width)
    return []
  })
}
