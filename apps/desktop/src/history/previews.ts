import {
  ImageResourceManager,
  renderHistoryThumbnail,
  loadHistoryDocumentFonts,
  parseEditorDocument,
} from '@cute-screen/editor-vue'
import type { ImageResourceLease } from '@cute-screen/editor-vue'
import type { RecentCapture } from '../generated/desktop-ipc'
import {
  historyRequest,
  type HistoryBridge,
} from './bridge'
import {
  createHistoryPreviewWorker,
  type ThumbnailJob,
} from '@cute-screen/editor-vue'

/** One visible-priority queue; only small, decoded previews survive each job. */
export class HistoryPreviews {
  readonly #bridge: HistoryBridge
  readonly #manager: ImageResourceManager<HTMLImageElement>
  readonly #items = new Map<string, RecentCapture>()
  #queue: Promise<unknown> = Promise.resolve()
  readonly #wanted = new Map<string, number>()
  #runningKey: string | undefined
  #generation = 0
  #worker: Worker | undefined
  #cancel: (() => void) | undefined
  constructor(bridge: HistoryBridge) {
    this.#bridge = bridge
    this.#manager = new ImageResourceManager({ byteBudget: 16 * 1024 * 1024, load: (key) => this.#load(key.blobHash) })
  }
  async acquire(
    item: RecentCapture,
    signal?: AbortSignal,
  ): Promise<ImageResourceLease<HTMLImageElement>> {
    const key = `${item.captureId}:${item.revision}`
    this.#items.set(key, item)
    this.#wanted.set(key, (this.#wanted.get(key) ?? 0) + 1)
    let released = false
    const releaseWanted = () => {
      if (released) return
      released = true
      signal?.removeEventListener('abort', releaseWanted)
      const count = (this.#wanted.get(key) ?? 1) - 1
      if (count > 0) this.#wanted.set(key, count)
      else {
        this.#wanted.delete(key)
        if (this.#runningKey === key) this.#cancel?.()
      }
    }
    signal?.addEventListener('abort', releaseWanted, { once: true })
    try {
      const lease = await this.#manager.acquire({ blobHash: key, variant: 'thumbnail', colorProfile: 'srgb' })
      if (signal?.aborted) {
        lease.release()
        throw new DOMException('Cancelled', 'AbortError')
      }
      return { value: lease.value, release: () => {
        lease.release()
        releaseWanted()
      } }
    } catch (error) {
      releaseWanted()
      this.#items.delete(key)
      throw error
    }
  }
  cancel(): Promise<void> {
    this.#generation += 1
    this.#cancel?.()
    this.#worker?.terminate()
    this.#worker = undefined
    return this.#queue.then(() => undefined, () => undefined)
  }
  dispose(): void {
    void this.cancel()
    this.#manager.dispose()
    this.#items.clear()
    this.#wanted.clear()
  }
  get bytesInUse(): number {
    return this.#manager.bytesInUse
  }

  async #load(key: string) {
    const item = this.#items.get(key)
    if (!item) throw new Error('Preview expired')
    const generation = this.#generation
    const task = this.#queue.catch(() => undefined).then(async () => {
      if (generation !== this.#generation || !this.#wanted.has(key)) throw new DOMException('Cancelled', 'AbortError')
      this.#runningKey = key
      let token = await this.#bridge.thumbnail(item.captureId, item.revision)
      if (!token) {
        try {
          await this.#generate(item, generation)
        } finally {
          if (this.#runningKey === key) this.#runningKey = undefined
        }
        token = await this.#bridge.thumbnail(item.captureId, item.revision)
      }
      if (!token) throw new Error('Saved preview unavailable')
      try {
        const bytes = await this.#bridge.read(token)
        if (generation !== this.#generation) throw new DOMException('Cancelled', 'AbortError')
        const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
        const image = new Image()
        image.src = url
        try {
          await image.decode()
        } catch (error) {
          URL.revokeObjectURL(url)
          throw error
        }
        return { value: image, byteSize: image.naturalWidth * image.naturalHeight * 4, dispose: () => {
          image.src = ''
          URL.revokeObjectURL(url)
          this.#items.delete(key)
        } }
      } finally {
        await this.#bridge.release(token)
      }
    })
    this.#queue = task
    return task
  }

  async #generate(
    item: RecentCapture,
    generation: number,
  ): Promise<void> {
    const tokens: string[] = []
    let opened = false
    try {
      const { document: record } = await historyRequest(this.#bridge, { kind: 'open', captureId: item.captureId }, 'opened')
      opened = true
      if (record.imageToken) tokens.push(record.imageToken)
      if (record.revision !== item.revision) throw new Error('Preview changed; reopen history')
      const parsed = parseEditorDocument(record.documentJson)
      if (parsed.kind !== 'editable') throw new Error('Document preview is unavailable')
      const hashes = new Set<string>([record.sourceHash])
      for (const layer of parsed.document.layers) {
        if (layer.kind === 'image') hashes.add(layer.payload.blobHash)
        if (layer.kind === 'shape') {
          const fill = layer.payload.fill as { kind?: string; blobHash?: string }
          if (fill.kind === 'imageTexture' && fill.blobHash) hashes.add(fill.blobHash)
        }
      }
      const images: ThumbnailJob['images'] = []
      for (const hash of hashes) {
        const original = hash === record.sourceHash ? record.imageToken : undefined
        const token = original ?? (await this.#bridge.resolve(hash)).resourceToken
        if (!tokens.includes(token)) tokens.push(token)
        images.push({ hash, blob: new Blob([await this.#bridge.read(token)]) })
      }
      if (generation !== this.#generation) throw new DOMException('Cancelled', 'AbortError')
      const job: ThumbnailJob = { document: parsed.document, images, fonts: previewFonts(parsed.document) }
      let bytes: Uint8Array
      try {
        bytes = await this.#renderWorker(job)
      } catch (error) {
        if (generation !== this.#generation || !this.#wanted.has(`${item.captureId}:${item.revision}`)) throw error
        this.#worker?.terminate()
        this.#worker = undefined
        bytes = await this.#renderFallback(job)
      }
      if (generation !== this.#generation) throw new DOMException('Cancelled', 'AbortError')
      await this.#bridge.writeThumbnail(record.documentId, record.revision, bytes)
    } finally {
      this.#worker?.terminate()
      this.#worker = undefined
      this.#cancel = undefined
      await Promise.all(tokens.map((token) => this.#bridge.release(token)))
      if (opened) await this.#bridge.request({ kind: 'release', captureId: item.captureId })
    }
  }
  async #renderWorker(job: ThumbnailJob): Promise<Uint8Array> {
    const worker = createHistoryPreviewWorker()
    this.#worker = worker
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#cancel = undefined
        reject(new Error('Preview worker unavailable'))
      }, 8000)
      const done = () => {
        clearTimeout(timer)
        this.#cancel = undefined
      }
      this.#cancel = () => {
        done()
        reject(new DOMException('Cancelled', 'AbortError'))
      }
      worker.onerror = (event) => {
        done()
        reject(new Error(event.message || 'Preview worker failed'))
      }
      worker.onmessage = (event: MessageEvent<{ bytes?: ArrayBuffer; error?: string }>) => {
        done()
        if (event.data.bytes) resolve(new Uint8Array(event.data.bytes))
        else reject(new Error(event.data.error ?? 'Preview rendering failed'))
      }
      worker.postMessage(job)
    })
  }
  async #renderFallback(job: ThumbnailJob): Promise<Uint8Array> {
    const images = new Map<string, HTMLImageElement>()
    const urls: string[] = []
    const canvas = document.createElement('canvas')
    try {
      await loadHistoryDocumentFonts(job.document)
      for (const source of job.images) {
        const url = URL.createObjectURL(source.blob)
        urls.push(url)
        const image = new Image()
        image.src = url
        await image.decode()
        images.set(source.hash, image)
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      await renderHistoryThumbnail(job.document, images, canvas, document.createElement('canvas'))
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Preview encoding failed')), 'image/png'))
      return new Uint8Array(await blob.arrayBuffer())
    } finally {
      for (const image of images.values()) image.src = ''
      for (const url of urls) URL.revokeObjectURL(url)
      canvas.width = canvas.height = 0
    }
  }

}

function previewFonts(documentModel: import('@cute-screen/editor-vue').EditorDocumentV1): ThumbnailJob['fonts'] {
  const fonts: ThumbnailJob['fonts'] = []
  const families = new Set<string>()
  for (const layer of documentModel.layers) {
    const content = layer.kind === 'text' || layer.kind === 'callout' ? layer.payload.content : layer.kind === 'numberedMarker' ? layer.payload.label : undefined
    for (const span of content?.spans ?? []) families.add(span.fontFamily)
    if (layer.kind === 'ruler') families.add('Roboto')
  }
  function rules(
    entries: CSSRuleList,
    base: string,
  ): void {
    for (const rule of entries) {
      if (rule instanceof CSSImportRule && rule.styleSheet) rules(rule.styleSheet.cssRules, rule.href)
      if (!(rule instanceof CSSFontFaceRule)) continue
      const family = rule.style.getPropertyValue('font-family').replace(/["']/g, '')
      if (!families.has(family)) continue
      const source = rule.style.getPropertyValue('src').replace(/url\((['"]?)(.*?)\1\)/g, (_match, _quote, path: string) => `url("${new URL(path, base).href}")`)
      fonts.push({ family: rule.style.getPropertyValue('font-family').replace(/["']/g, ''), source, weight: rule.style.getPropertyValue('font-weight') || '400', style: rule.style.getPropertyValue('font-style') || 'normal', unicodeRange: rule.style.getPropertyValue('unicode-range') || 'U+0-10FFFF' })
    }
  }
  for (const sheet of document.styleSheets) {
    try {
      rules(sheet.cssRules, sheet.href || location.href)
    } catch (error) {
      console.warn('History font source unavailable', error)
    }
  }
  return fonts
}
