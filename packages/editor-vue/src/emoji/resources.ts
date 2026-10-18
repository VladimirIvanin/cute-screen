import {
  EMOJI_PACK_VERSION,
  emojiResourceId,
  type EditorDocumentV1,
  findEmoji,
} from '@cute-screen/editor-renderer'
import licenseUrl from './assets/Apache-2.0.txt?url&no-inline'
import noticeUrl from './assets/NOTICE?url&no-inline'
export const EMOJI_LICENSE_URL = licenseUrl
export const EMOJI_NOTICE_URL = noticeUrl

const urls = import.meta.glob('./assets/*.svg', { eager: true, query: '?url&no-inline', import: 'default' }) as Record<string, string>
const pending = new Map<string, Promise<HTMLImageElement>>()
export function emojiUrl(assetId: string): string {
  if (!findEmoji(assetId)) throw new Error(`Unknown bundled emoji: ${assetId}`)
  const url = urls[`./assets/emoji_u${assetId}.svg`]
  if (!url) throw new Error(`Missing bundled emoji: ${assetId}`)
  return url
}
export function loadEmoji(assetId: string): Promise<HTMLImageElement> {
  const existing = pending.get(assetId)
  if (existing) return existing
  const promise = (async () => {
    const image = new Image()
    image.src = emojiUrl(assetId)
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight) throw new Error(`Empty emoji: ${assetId}`)
    return image
  })().catch((error: unknown) => {
    pending.delete(assetId)
    throw error
  })
  pending.set(assetId, promise)
  return promise
}
export function loadEmojiResource(id: string): Promise<HTMLImageElement> {
  const prefix = `emoji:notoEmoji:${EMOJI_PACK_VERSION}:`
  if (!id.startsWith(prefix)) return Promise.reject(new Error(`Unavailable emoji resource: ${id}`))
  return loadEmoji(id.slice(prefix.length))
}
export async function documentEmojiImages(
  document: EditorDocumentV1,
  existing: ReadonlyMap<string, unknown> = new Map(),
): Promise<ReadonlyMap<string, HTMLImageElement>> {
  const ids = new Set(document.layers
    .filter((layer) => layer.kind === 'emoji')
    .map((layer) => emojiResourceId(layer.payload.asset)))
  const missing = [...ids].filter((id) => !existing.has(id))
  return new Map(await Promise.all(missing.map(async (id) => [id, await loadEmojiResource(id)] as const)))
}
/** Workers receive PNG blobs because createImageBitmap(SVG) is not portable. */
export async function emojiThumbnailImages(documentModel: EditorDocumentV1): Promise<
  Array<{ hash: string; blob: Blob }>
> {
  const images = await documentEmojiImages(documentModel)
  return Promise.all([...images].map(async ([hash, image]) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Emoji thumbnail canvas is unavailable')
    context.drawImage(image, 0, 0, 256, 256)
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Emoji thumbnail encoding failed')), 'image/png'))
      return { hash, blob }
    } finally {
      canvas.width = canvas.height = 0
    }
  }))
}
