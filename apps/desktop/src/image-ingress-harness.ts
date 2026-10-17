import type { ShallowRef } from 'vue'
import type {
  ContentImageBridge,
  ClipboardBridge,
  TextureImportOutcome,
  ImageDropEvent,
  DocumentSessionController,
} from '@cute-screen/editor-vue'

/** Browser-only OS boundary. The mounted editor owns decode, layout and commands. */
export function installImageIngressHarness(
  content: ShallowRef<ContentImageBridge | undefined>,
  clipboard: ShallowRef<ClipboardBridge | undefined>,
  session: ShallowRef<DocumentSessionController | undefined>,
): () => void {
  let source = new Blob()
  let width = 1
  let height = 1
  let format: 'png' | 'jpeg' | 'webp' | 'svg' = 'png'
  let listener: ((event: ImageDropEvent) => void) | undefined
  const resources = new Map<string, { blob: Blob; url: string; hash: string }>()
  async function choose(
    next: typeof format,
    w: number,
    h: number,
  ) {
    width = w
    height = h
    format = next
    if (next === 'svg') source = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#55aacc"/></svg>`], { type: 'image/svg+xml' })
    else {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const context = canvas.getContext('2d')!
      context.fillStyle = '#55aacc'
      context.fillRect(0, 0, w, h)
      context.clearRect(0, 0, Math.min(w / 2, 16), Math.min(h / 2, 16))
      source = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('fixture encode')), `image/${next}`))
    }
  }
  const grant = async (): Promise<Extract<TextureImportOutcome, { kind: 'imported' }>> => {
    const token = crypto.randomUUID()
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await source.arrayBuffer()))].map((v) => v.toString(16).padStart(2, '0')).join('')
    resources.set(token, { blob: source, url: URL.createObjectURL(source), hash })
    return { kind: 'imported', blobHash: hash, resourceToken: token, width, height, format, mimeType: source.type as 'image/png' }
  }
  const bridge: ContentImageBridge = {
    importContentImage: grant,
    importDroppedImage: grant,
    subscribeImageDrop: async (callback) => {
      listener = callback
      return () => {
        listener = undefined
      }
    },
    stageImage: async (token, correlationId) => {
      const resource = resources.get(token)!
      return {
        token, assetUrl: resource.url, mimeType: resource.blob.type,
        width, height, sha256: resource.hash, correlationId,
      }
    },
    readImageBytes: async (token) => resources.get(token)!.blob.arrayBuffer(),
    releaseImage: async (token) => {
      const resource = resources.get(token)
      if (resource) URL.revokeObjectURL(resource.url)
      resources.delete(token)
    },
  }
  content.value = bridge
  clipboard.value = { ...bridge, readClipboardSnapshot: async () => ({ bitmap: await grant() }) }
  const target = window as unknown as { __cuteScreenE2eImages?: unknown }
  target.__cuteScreenE2eImages = {
    choose,
    drop: (x: number, y: number, count: number) => listener?.({ phase: 'drop', x, y, fileCount: count, supported: true, token: 'fixture-drop' }),
    crop: () => {
      const active = session.value!
      active.execute({ type: 'setCrop', before: active.snapshot.core.document.crop, after: { x: 300, y: 200, width: 1800, height: 1000 } })
    },
  }
  return () => {
    for (const resource of resources.values()) URL.revokeObjectURL(resource.url)
    resources.clear()
    delete target.__cuteScreenE2eImages
  }
}
