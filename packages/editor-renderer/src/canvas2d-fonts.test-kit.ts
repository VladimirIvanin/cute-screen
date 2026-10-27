import { GlobalFonts } from '@napi-rs/canvas'
import { fileURLToPath } from 'node:url'
import type { Canvas2DRendererOptions } from './backends/canvas2d/contracts'

const roboto = 'Cute Screen Test Roboto'
const ptSerif = 'Cute Screen Test PT Serif'

// Private aliases keep fixture metrics independent of installed system fonts.
for (const [slug, face, alias] of [
  ['roboto', '400-normal', roboto],
  ['roboto', '600-normal', roboto],
  ['roboto', '700-normal', roboto],
  ['pt-serif', '700-italic', ptSerif],
] as const) {
  const fontPath = fileURLToPath(new URL(
    `../../editor-vue/node_modules/@fontsource/${slug}/files/${slug}-latin-${face}.woff2`,
    import.meta.url,
  ))
  if (!GlobalFonts.registerFromPath(fontPath, alias)) {
    throw new Error(`Could not register bundled test font: ${slug} ${face}`)
  }
}

export const resolveCanvas2DTestFontFamily: NonNullable<Canvas2DRendererOptions['resolveFontFamily']> = (
  _text,
  style,
) => {
  switch (style.fontFamily) {
    case 'Roboto':
      return roboto
    case 'PT Serif':
      return ptSerif
    default:
      throw new Error(`No bundled test font for ${style.fontFamily}`)
  }
}
