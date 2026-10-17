import {
  createContentImageLayer,
  createTextLayer,
  imagePlacement,
} from '@cute-screen/editor-renderer'
import {
  INITIAL_TEXT_MAX_WIDTH,
  measuredTextLayer,
} from '../../text-layout'
import { loadTextFontFamily } from '../../text-fonts'
import {
  loadImageWithBinaryFallback,
  type ImageTransportBridge,
  type ClipboardBitmapSnapshot,
} from '../../image-transport'
import type {
  TextureImportOutcome,
  ImageInsertionTarget,
} from '../../texture-fill'
import type { ContentControllerContext } from './content-contracts'

type ImportedImage = Extract<TextureImportOutcome, { kind: 'imported' }> | ClipboardBitmapSnapshot
type ImportResult = ImportedImage | { kind: 'cancelled' } | { text?: string }
type Point = { readonly x: number; readonly y: number }

function imageError(
  error: unknown,
  ru: boolean,
): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === 'imageTooLarge') return ru ? 'Изображение слишком большое.' : 'The image is too large.'
  if (code === 'permissionDenied' || code === 'storageIo') return ru ? 'Не удалось прочитать изображение. Попробуйте выбрать файл ещё раз.' : 'Could not read the image. Choose the file again.'
  if (code === 'invalidImage') return ru ? 'Выберите PNG, JPEG, WebP или безопасный SVG.' : 'Choose a PNG, JPEG, WebP or safe SVG image.'
  if (code === 'imageCorrupt' || code === 'dimensionMismatch') return ru ? 'Не удалось декодировать изображение. Выберите другой файл.' : 'Could not decode the image. Choose another file.'
  return ru ? 'Не удалось добавить изображение. Попробуйте ещё раз.' : 'Could not add the image. Please try again.'
}

/** One pending OS ingress operation; decoded resources outlive undo/redo. */
export class ImageInsertionController {
  private generation = 0
  private disposed = false
  private abort: AbortController | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  constructor(private readonly context: ContentControllerContext) {}

  private message(
    en: string,
    ru: string,
  ): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.context.feedback) this.context.feedback.value = this.context.locale?.() === 'ru' ? ru : en
    this.timer = setTimeout(() => {
      if (this.context.feedback) this.context.feedback.value = undefined
    }, 3000)
  }

  private report(error: unknown): void {
    console.warn('cute-screen image insertion failed', error)
    this.context.error.value = imageError(error, this.context.locale?.() === 'ru')
  }

  private target(): ImageInsertionTarget {
    const document = this.context.activeDocument.value
    const fallback = document?.crop ?? (document ? { x: 0, y: 0, ...document.canvas } : undefined)
    const target = this.context.target ? this.context.target() : fallback ? { bounds: fallback } : undefined
    if (!target) throw new Error('The visible canvas is unavailable')
    return target
  }

  private async insert(
    image: ImportedImage,
    bridge: ImageTransportBridge,
    current: () => boolean,
    origin?: Point,
  ): Promise<void> {
    if (!image.resourceToken || !image.blobHash) throw new Error('Invalid image import response')
    const loaded = await loadImageWithBinaryFallback({
      token: image.resourceToken, correlationId: crypto.randomUUID(), bridge,
      createResource: async (resource) => resource,
    })
    let committed = false
    try {
      if (!current()) return
      const target = this.target()
      const placement = imagePlacement(image.width, image.height, target.bounds, origin ?? target.center)
      const layer = createContentImageLayer({
        id: crypto.randomUUID(), blobHash: image.blobHash, format: image.format,
        intrinsicWidth: image.width, intrinsicHeight: image.height, origin: { x: placement.x, y: placement.y },
      })
      const previousImages = this.context.textureImages.value
      this.context.textureImages.value = new Map(previousImages).set(image.blobHash, loaded.resource)
      try {
        this.context.addLayer({
          ...layer,
          transform: { ...layer.transform, scaleX: placement.scale, scaleY: placement.scale },
        })
        committed = true
      } catch (error) {
        this.context.textureImages.value = previousImages
        throw error
      }
      this.message('Image added', 'Изображение добавлено')
    } finally {
      if (!committed) loaded.resource.src = ''
    }
  }

  private async apply(
    result: ImportResult,
    bridge: ImageTransportBridge,
    current: () => boolean,
    origin?: Point,
  ): Promise<void> {
    if ('kind' in result && result.kind === 'cancelled') {
      this.message('Image import cancelled', 'Вставка изображения отменена')
    } else if ('resourceToken' in result) {
      await this.insert(result, bridge, current, origin)
    } else if ('text' in result && result.text) {
      const defaults = this.context.textDefaults.value
      await loadTextFontFamily(defaults.fontFamily)
      if (!current()) return
      const bounds = this.target().bounds
      const layer = createTextLayer({
        id: crypto.randomUUID(), text: result.text,
        origin: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, ...defaults,
      })
      if (layer) this.context.addLayer(measuredTextLayer(layer, INITIAL_TEXT_MAX_WIDTH))
    } else if ('kind' in result) throw new Error('Invalid image import response')
  }

  private async run(
    source: () => Promise<ImportResult>,
    bridge: ImageTransportBridge,
    origin?: Point,
  ): Promise<void> {
    const context = this.context
    if (
      context.contentImageImporting.value ||
      this.disposed ||
      context.props.readOnlyDocument ||
      context.props.quickSelectionMode ||
      !context.props.documentSession
    ) return
    const session = context.props.documentSession
    const documentId = context.activeDocument.value?.id
    const operation = ++this.generation
    const current = () => !this.disposed &&
      operation === this.generation &&
      context.props.documentSession === session &&
      context.activeDocument.value?.id === documentId &&
      !context.props.readOnlyDocument &&
      !context.props.quickSelectionMode
    context.error.value = undefined
    if (context.feedback) context.feedback.value = undefined
    context.contentImageImporting.value = true
    let token: string | undefined
    try {
      const result = await source()
      if ('resourceToken' in result) token = result.resourceToken
      if (current()) await this.apply(result, bridge, current, origin)
    } catch (error) {
      if (current()) this.report(error)
    } finally {
      if (token) {
        try {
          await bridge.releaseImage?.(token)
        } catch (error) {
          console.warn('cute-screen image token release failed', error)
        }
      }
      context.contentImageImporting.value = false
      if (current()) context.focus?.()
    }
  }

  import(origin?: Point): Promise<void> {
    const bridge = this.context.props.contentImageBridge
    return bridge ? this.run(() => bridge.importContentImage(crypto.randomUUID()), bridge, origin) : Promise.resolve()
  }

  drop(
    token: string,
    target: ImageInsertionTarget,
  ): Promise<void> {
    const bridge = this.context.props.contentImageBridge
    return bridge?.importDroppedImage
      ? this.run(() => bridge.importDroppedImage!(token, crypto.randomUUID()), bridge, target.center)
      : Promise.resolve()
  }

  paste(): Promise<void> {
    const bridge = this.context.props.clipboardBridge
    return bridge ? this.run(async () => {
      const snapshot = await bridge.readClipboardSnapshot(crypto.randomUUID())
      return snapshot.bitmap ?? (snapshot.text ? { text: snapshot.text } : {})
    }, bridge) : Promise.resolve()
  }

  async openDocument(token: string): Promise<void> {
    const context = this.context
    if (
      this.disposed ||
      context.contentImageImporting.value ||
      context.props.readOnlyDocument ||
      context.activeDocument.value ||
      !context.props.openDroppedImage
    ) return
    const operation = ++this.generation
    this.abort = new AbortController()
    context.contentImageImporting.value = true
    context.error.value = undefined
    try {
      await context.props.openDroppedImage(token, this.abort.signal)
      if (!this.disposed && operation === this.generation) this.message('Image opened', 'Изображение открыто')
    } catch (error) {
      if (!this.disposed && operation === this.generation) this.report(error)
    } finally {
      context.contentImageImporting.value = false
      this.abort = undefined
    }
  }

  cancel(): void {
    this.generation += 1
    this.abort?.abort()
    this.context.error.value = undefined
    this.message('Image import cancelled', 'Вставка изображения отменена')
    this.context.focus?.()
  }

  dispose(): void {
    this.disposed = true
    this.abort?.abort()
    this.generation += 1
    if (this.timer) clearTimeout(this.timer)
  }
}
