import type { ShallowRef } from 'vue'
import type {
  ContentImageBridge,
  MaterialBridge,
  MaterialRecord,
  TextureFillBridge,
  TextureImportOutcome,
} from '@cute-screen/editor-vue'

/** Fake OS/library boundary; preview decode, UI and document commands remain production code. */
export async function installLogoLibraryHarness(
  texture: ShallowRef<TextureFillBridge | undefined>,
  materials: ShallowRef<MaterialBridge | undefined>,
  content: ShallowRef<ContentImageBridge | undefined>,
): Promise<() => void> {
  const blobs = new Map<string, Blob>()
  const tokens = new Map<string, { hash: string; url: string }>()
  let records: MaterialRecord[] = []
  for (const [index, shape] of [
    '<circle cx="48" cy="48" r="32" fill="#f26837"/>',
    '<path d="M12 80V16L48 48L84 16V80Z" fill="#2467db"/>',
    '<path d="M48 8L88 80H8Z" fill="#18181b"/>',
  ].entries()) {
    const blob = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">${shape}</svg>`], { type: 'image/svg+xml' })
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('')
    blobs.set(hash, blob)
    records.push({ id: `logo-${index}`, title: ['Orange circle', 'Blue mark', 'Black triangle'][index]!,
      kind: 'logo', byteSize: blob.size, valueJson: JSON.stringify({ blobHash: hash, width: 96, height: 96, format: 'svg' }) })
  }
  const resolveTexture = async (hash: string): Promise<TextureImportOutcome> => {
    const blob = blobs.get(hash)
    if (!blob) throw new Error('Logo blob missing')
    const token = crypto.randomUUID()
    tokens.set(token, { hash, url: URL.createObjectURL(blob) })
    return { kind: 'imported', blobHash: hash, resourceToken: token, format: 'svg', mimeType: 'image/svg+xml', width: 96, height: 96 }
  }
  const bridge: TextureFillBridge = {
    resolveTexture,
    importTexture: async () => resolveTexture(blobs.keys().next().value!),
    stageImage: async (token, correlationId) => {
      const item = tokens.get(token)!
      return { token, assetUrl: item.url, correlationId, width: 96, height: 96, sha256: item.hash, mimeType: 'image/svg+xml' }
    },
    readImageBytes: async (token) => blobs.get(tokens.get(token)!.hash)!.arrayBuffer(),
    releaseImage: async (token) => {
      const item = tokens.get(token)
      if (item) URL.revokeObjectURL(item.url)
      tokens.delete(token)
    },
  }
  texture.value = bridge
  content.value = { ...bridge, importContentImage: bridge.importTexture }
  materials.value = {
    list: async () => records,
    put: async (record) => {
      records = [...records, { ...record, byteSize: 0 }]
    },
    remove: async (id) => {
      records = records.filter((record) => record.id !== id)
    },
  }
  return () => {
    for (const item of tokens.values()) URL.revokeObjectURL(item.url)
    tokens.clear()
    blobs.clear()
  }
}
