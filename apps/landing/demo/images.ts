import { inspectImageHeader } from './image-header'
import type {
  ClipboardBridge,
  ContentImageBridge,
  TextureFillBridge,
  TextureImportOutcome,
} from '@cute-screen/editor-vue'
import type { DemoStorage } from './storage'

type ImageRecord = { blob: Blob; width: number; height: number; format: 'png' | 'jpeg' | 'webp'; hash: string }
export function pickImage(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp'
    input.onchange = () => resolve(input.files?.[0])
    input.oncancel = () => resolve(undefined)
    input.click()
  })
}
export class DemoImages implements ContentImageBridge, TextureFillBridge, ClipboardBridge {
  private records = new Map<string, ImageRecord>()
  clipboardFile: Blob | undefined
  constructor(private storage: DemoStorage) {}
  async ingest(blob: Blob): Promise<ImageRecord> {
    if (blob.size > 32 * 1024 * 1024) throw new Error('Maximum file size: 32 MiB')
    const bytes = await blob.arrayBuffer()
    const { format } = inspectImageHeader(bytes)
    const normalized = new Blob([bytes], { type: `image/${format}` })
    const bitmap = await createImageBitmap(normalized, { imageOrientation: 'from-image' })
    const { width, height } = bitmap
    bitmap.close()
    if (
      width > 8192 ||
      height > 8192 ||
      width * height > 16_000_000
    ) throw new Error('Maximum image: 16 megapixels, 8192 px per side')
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
      bytes)),
    (value) => value.toString(16).padStart(2,
      '0')).join('')
    const record: ImageRecord = { blob: normalized, width, height, format, hash }
    this.records.set(hash, record)
    return record
  }
  async persist(): Promise<void> {
    for (const [hash, record] of this.records) await this.storage.put('blobs', hash, record)
  }
  async record(hash: string): Promise<ImageRecord> {
    const record = this.records.get(hash) ?? await this.storage.get<ImageRecord>('blobs', hash)
    if (!record) throw new Error('Image resource missing')
    this.records.set(hash, record)
    return record
  }
  private outcome(record: ImageRecord): TextureImportOutcome {
    return { kind: 'imported',
      blobHash: record.hash,
      resourceToken: record.hash,
      width: record.width,
      height: record.height,
      format: record.format,
      mimeType: record.blob.type as 'image/png' | 'image/jpeg' | 'image/webp' }
  }
  async importTexture(): Promise<TextureImportOutcome> {
    const file = await pickImage()
    return file ? this.outcome(await this.ingest(file)) : { kind: 'cancelled' }
  }
  async importContentImage(): Promise<TextureImportOutcome> {
    return this.importTexture()
  }
  async resolveTexture(hash: string): Promise<TextureImportOutcome> {
    return this.outcome(await this.record(hash))
  }
  async stageImage(
    token: string,
    correlationId: string,
  ) {
    const record = await this.record(token)
    return { token,
      correlationId,
      assetUrl: '',
      mimeType: record.blob.type,
      sha256: record.hash,
      width: record.width,
      height: record.height }
  }
  async readImageBytes(token: string): Promise<ArrayBuffer> {
    return (await this.record(token)).blob.arrayBuffer()
  }
  async readClipboardSnapshot() {
    let file = this.clipboardFile
    this.clipboardFile = undefined
    if (!file) {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((value) => value.startsWith('image/'))
        if (type) {
          file = await item.getType(type)
          break
        }
      }
    }
    if (!file) return {}
    const record = await this.ingest(file)
    return { bitmap: { blobHash: record.hash,
      resourceToken: record.hash,
      format: record.format,
      mimeType: record.blob.type,
      width: record.width,
      height: record.height } }
  }
  async writeClipboardText(text: string): Promise<void> {
    await navigator.clipboard.writeText(text)
  }
}
