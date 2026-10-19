import {
  EMOJI_PACK_VERSION,
  findEmoji,
} from './emoji-catalog'
import {
  transformPoint,
  transformToMatrix,
} from './geometry'
import { createEmojiLayer } from './tools/content/media'
import type {
  EmojiAssetReference,
  EmojiLayer,
  Point,
  Rect,
} from './document/types'

export function emojiResourceId(asset: EmojiAssetReference): string {
  return `emoji:${asset.collection}:${asset.version}:${asset.assetId}`
}
export function emojiReference(id: string): EmojiAssetReference {
  const entry = findEmoji(id)
  if (!entry) throw new Error(`Unknown emoji: ${id}`)
  return { collection: 'notoEmoji', version: EMOJI_PACK_VERSION, assetId: entry.id }
}
export function createPlacedEmoji(
  id: string,
  assetId: string,
  center: Point,
  size: number,
  bounds: Rect,
): EmojiLayer {
  if (
    ![size, center.x, center.y, bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
    size <= 0 ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    throw new Error('Invalid emoji placement')
  const reference = emojiReference(assetId)
  const side = Math.min(size, bounds.width, bounds.height)
  return createEmojiLayer({ id, grapheme: findEmoji(assetId)!.grapheme, asset: reference, size: side,
    origin: { x: Math.max(bounds.x, Math.min(center.x - side / 2, bounds.x + bounds.width - side)),
      y: Math.max(bounds.y, Math.min(center.y - side / 2, bounds.y + bounds.height - side)) } })
}
export function replaceEmoji(
  layer: EmojiLayer,
  assetId: string,
): EmojiLayer {
  return { ...layer, payload: { grapheme: findEmoji(assetId)?.grapheme ?? '', asset: emojiReference(assetId) } }
}
export function resizeEmoji(
  layer: EmojiLayer,
  size: number,
): EmojiLayer {
  if (
    !Number.isFinite(size) ||
    size <= 0 ||
    size > 32768
  ) throw new Error('Invalid emoji size')
  const bounds = layer.localBounds!
  const delta = (bounds.width - size) / 2
  const origin = transformPoint(transformToMatrix(layer.transform), {
    x: bounds.x + delta,
    y: bounds.y + delta,
  })
  return { ...layer, localBounds: { x: 0, y: 0, width: size, height: size },
    transform: {
      ...layer.transform,
      translateX: origin.x,
      translateY: origin.y } }
}
