import {
  loadImageWithBinaryFallback,
  type ImageTransportBridge,
} from './image-transport'

export type TextureImportOutcome =
  | Readonly<{ readonly kind: 'cancelled' }>
  | Readonly<{
      readonly kind: 'imported'
      readonly blobHash: string
      readonly format: 'png' | 'jpeg' | 'webp' | 'svg'
      readonly mimeType:
        'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'
      readonly width: number
      readonly height: number
      readonly resourceToken: string
    }>

/** Native picker and repository boundary; never transports image data as JSON. */
export interface TextureFillBridge extends ImageTransportBridge {
  importTexture(correlationId: string): Promise<TextureImportOutcome>
  resolveTexture(
    blobHash: string,
    correlationId: string,
  ): Promise<TextureImportOutcome>
}

/** Separate from texture selection: the result becomes a document image layer. */
export interface ContentImageBridge extends ImageTransportBridge {
  importContentImage(correlationId: string): Promise<TextureImportOutcome>
}

export type TextureResourceState =
  | Readonly<{ readonly kind: 'ready'; readonly image: HTMLImageElement }>
  | Readonly<{ readonly kind: 'missing'; readonly error: string }>

/**
 * Keeps texture images outside Vue state. A document keeps only blobHash; a
 * fresh opaque token is resolved for every app session.
 */
export class TextureResourceResolver {
  readonly #bridge: TextureFillBridge
  readonly #correlationId: () => string
  #resources = new Map<string, TextureResourceState>()

  constructor(options: {
    readonly bridge: TextureFillBridge
    readonly correlationId: () => string
  }) {
    this.#bridge = options.bridge
    this.#correlationId = options.correlationId
  }

  get(blobHash: string): TextureResourceState | undefined {
    return this.#resources.get(blobHash)
  }

  async import(): Promise<TextureImportOutcome> {
    const outcome = await this.#bridge.importTexture(this.#correlationId())
    if (outcome.kind === 'imported') await this.#load(outcome)
    return outcome
  }

  async resolve(blobHash: string): Promise<TextureResourceState> {
    const existing = this.#resources.get(blobHash)
    if (existing?.kind === 'ready') return existing
    try {
      const outcome = await this.#bridge.resolveTexture(
        blobHash,
        this.#correlationId(),
      )
      if (outcome.kind === 'cancelled') {
        throw new Error('Texture resolution was cancelled')
      }
      return await this.#load(outcome)
    } catch (error) {
      const missing: TextureResourceState = {
        kind: 'missing',
        error:
          error instanceof Error ? error.message : 'Texture is unavailable',
      }
      this.#resources.set(blobHash, missing)
      return missing
    }
  }

  remove(blobHash: string): void {
    this.#resources.delete(blobHash)
  }

  async #load(
    outcome: Extract<TextureImportOutcome, { kind: 'imported' }>,
  ): Promise<TextureResourceState> {
    try {
      const loaded = await loadImageWithBinaryFallback({
        token: outcome.resourceToken,
        correlationId: this.#correlationId(),
        bridge: this.#bridge,
        createResource: async (image) => image,
      })
      const ready: TextureResourceState = {
        kind: 'ready',
        image: loaded.resource,
      }
      this.#resources.set(outcome.blobHash, ready)
      return ready
    } catch (error) {
      const missing: TextureResourceState = {
        kind: 'missing',
        error:
          error instanceof Error ? error.message : 'Texture is unavailable',
      }
      this.#resources.set(outcome.blobHash, missing)
      return missing
    }
  }
}
