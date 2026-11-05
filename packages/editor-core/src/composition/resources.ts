import type { CompositionSettings } from './types'
/** Canonical material references are independent from cache/transport registrations. */
export function compositionBlobHashes(value: CompositionSettings | undefined): readonly string[] {
  if (!value) return []
  return [...new Set([value.background.image?.blobHash, ...value.branding.map((b) => b.image?.blobHash)]
    .filter((hash): hash is string => Boolean(hash)))]
}
