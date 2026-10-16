import type { EditorDocumentV1 } from '@cute-screen/editor-renderer'

/** Deliberately fixed: installing system fonts never expands the tool menu. */
export const TEXT_FONT_FAMILIES = [
  'Roboto', 'Manrope', 'Rubik', 'Comfortaa', 'Oswald', 'PT Serif',
  'Lora', 'Roboto Slab', 'JetBrains Mono', 'PT Mono', 'Caveat', 'Marck Script',
] as const

export function isBundledTextFont(family: string): boolean {
  return TEXT_FONT_FAMILIES.some((value) => value === family)
}

const loads = new WeakMap<FontFaceSet, Map<string, Promise<void>>>()

/** Both scripts load together so typing a Cyrillic letter cannot swap metrics. */
export async function loadTextFont(
  family: string,
  weight = 400,
  italic = false,
): Promise<void> {
  if (
    !isBundledTextFont(family) ||
    typeof document === 'undefined' ||
    !document.fonts
  ) return
  const fonts = document.fonts
  let cache = loads.get(fonts)
  if (!cache) {
    cache = new Map()
    loads.set(fonts, cache)
  }
  const descriptor = `${italic ? 'italic' : 'normal'} ${weight} 20px "${family}"`
  const existing = cache.get(descriptor)
  if (existing) return existing
  const loading = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const faces = await Promise.race([
        fonts.load(descriptor, 'Aa Яя 123'),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`Font loading timed out: ${family}`)), 8000)
        }),
      ])
      if (!faces.length) throw new Error(`Bundled font is unavailable: ${family}`)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  })()
  cache.set(descriptor, loading)
  try {
    await loading
  } catch (error) {
    cache.delete(descriptor)
    throw error
  }
}

export async function loadTextFontFamily(family: string): Promise<void> {
  await Promise.all([
    loadTextFont(family),
    loadTextFont(family, 700),
    loadTextFont(family, 400, true),
    loadTextFont(family, 700, true),
  ])
}

export async function loadDocumentTextFonts(document: EditorDocumentV1): Promise<void> {
  const families = new Set(['Roboto'])
  for (const layer of document.layers) {
    const content = layer.kind === 'text' || layer.kind === 'callout'
      ? layer.payload.content : layer.kind === 'numberedMarker' ? layer.payload.label : undefined
    for (const span of content?.spans ?? []) families.add(span.fontFamily)
  }
  await Promise.all([...families].map(loadTextFontFamily))
}
