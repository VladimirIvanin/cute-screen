import {
  isBundledTextFont,
  loadTextFont,
} from '../../text-fonts'
import type { RichTextEditorController } from '../../rich-text-editor'

export function waitForTextFonts(
  controller: RichTextEditorController,
  ready: () => void,
  failed: (error: unknown) => void,
): boolean {
  if (!document.fonts?.check) return false
  const missing = [controller.state.typingStyle, ...controller.state.content.spans]
    .filter((style) => isBundledTextFont(style.fontFamily) && !document.fonts.check(
      `${style.italic ? 'italic' : 'normal'} ${style.weight} 20px "${style.fontFamily}"`, 'Aa Яя 123',
    ))
  if (!missing.length) return false
  void Promise.all(missing.map((style) => loadTextFont(style.fontFamily, style.weight, style.italic)))
    .then(ready).catch(failed)
  return true
}
