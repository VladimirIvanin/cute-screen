export type ImageVariant = 'original' | 'interactive-2048' | 'thumbnail'

export interface ImageResourceKey {
  readonly blobHash: string
  readonly variant: ImageVariant
  readonly colorProfile: string
}

export interface ManagedImageResource<T> {
  readonly value: T
  readonly byteSize: number
  dispose(): void
}

export interface ImageResourceLease<T> {
  readonly value: T
  release(): void
}

export interface ImageResourceManagerOptions<T> {
  readonly byteBudget?: number
  readonly load: (key: ImageResourceKey) => Promise<ManagedImageResource<T>>
}

interface Entry<T> {
  readonly key: string
  readonly resource: ManagedImageResource<T>
  references: number
  lastUsed: number
}

const DEFAULT_BYTE_BUDGET = 256 * 1024 * 1024

function keyOf(key: ImageResourceKey): string {
  return `${key.blobHash}:${key.variant}:${key.colorProfile}`
}

/**
 * A renderer-neutral LRU. The loader owns browser/CanvasKit resource details,
 * while this class ensures that a document cannot decode or upload the same
 * content-addressed image twice concurrently.
 */
export class ImageResourceManager<T> {
  readonly #budget: number
  readonly #load: ImageResourceManagerOptions<T>['load']
  readonly #entries = new Map<string, Entry<T>>()
  readonly #pending = new Map<string, Promise<Entry<T>>>()
  #bytes = 0
  #closed = false

  constructor(options: ImageResourceManagerOptions<T>) {
    this.#budget = options.byteBudget ?? DEFAULT_BYTE_BUDGET
    if (!Number.isFinite(this.#budget) || this.#budget <= 0)
      throw new RangeError('byteBudget must be positive')
    this.#load = options.load
  }

  get byteBudget(): number {
    return this.#budget
  }

  get bytesInUse(): number {
    return this.#bytes
  }

  get entryCount(): number {
    return this.#entries.size
  }

  async acquire(key: ImageResourceKey): Promise<ImageResourceLease<T>> {
    if (this.#closed) throw new Error('ImageResourceManager is disposed')
    const cached = this.#entries.get(keyOf(key))
    const entry = cached ?? (await this.#loadOnce(key))
    entry.references += 1
    entry.lastUsed = Date.now()
    return {
      value: entry.resource.value,
      release: () => {
        if (entry.references === 0) return
        entry.references -= 1
        entry.lastUsed = Date.now()
        this.#evict()
      },
    }
  }

  dispose(): void {
    if (this.#closed) return
    this.#closed = true
    for (const entry of this.#entries.values()) entry.resource.dispose()
    this.#entries.clear()
    this.#pending.clear()
    this.#bytes = 0
  }

  async #loadOnce(key: ImageResourceKey): Promise<Entry<T>> {
    const serialized = keyOf(key)
    const existing = this.#pending.get(serialized)
    if (existing) return existing
    const promise = this.#load(key)
      .then((resource) => {
        if (!Number.isFinite(resource.byteSize) || resource.byteSize < 0)
          throw new RangeError(
            'image resource byteSize must be finite and non-negative',
          )
        const entry: Entry<T> = {
          key: serialized,
          resource,
          references: 0,
          lastUsed: Date.now(),
        }
        if (this.#closed) {
          resource.dispose()
          throw new Error('ImageResourceManager was disposed while decoding')
        }
        this.#entries.set(serialized, entry)
        this.#bytes += resource.byteSize
        this.#pending.delete(serialized)
        this.#evict()
        return entry
      })
      .catch((error: unknown) => {
        this.#pending.delete(serialized)
        throw error
      })
    this.#pending.set(serialized, promise)
    return promise
  }

  #evict(): void {
    if (this.#bytes <= this.#budget) return
    const candidates = [...this.#entries.values()]
      .filter((entry) => entry.references === 0)
      .sort((left, right) => left.lastUsed - right.lastUsed)
    for (const entry of candidates) {
      if (this.#bytes <= this.#budget) break
      this.#entries.delete(entry.key)
      this.#bytes -= entry.resource.byteSize
      entry.resource.dispose()
    }
  }
}

export interface ImageVariantSelection {
  readonly variant: ImageVariant
  readonly reason: 'fitPreview' | 'zoomRequiresOriginal' | 'textureLimit'
}

export function selectImageVariant(input: {
  readonly width: number
  readonly height: number
  readonly zoom: number
  readonly maxTextureSize: number
}): ImageVariantSelection {
  if (input.width > input.maxTextureSize || input.height > input.maxTextureSize)
    return { variant: 'interactive-2048', reason: 'textureLimit' }
  if (input.zoom <= 1 && Math.max(input.width, input.height) > 2048)
    return { variant: 'interactive-2048', reason: 'fitPreview' }
  return { variant: 'original', reason: 'zoomRequiresOriginal' }
}
