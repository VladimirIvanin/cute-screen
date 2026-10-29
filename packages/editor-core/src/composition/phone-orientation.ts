import type {
  EditorDocument,
  PresentationSettingsV1,
} from '../document/types'
import type { CompositionSettings } from './types'

export function updateCompositionPresentation(
  document: Pick<EditorDocument, 'canvas' | 'crop' | 'presentation'>,
  composition: CompositionSettings | undefined,
  automaticPhoneOrientation = true,
): PresentationSettingsV1 {
  const previous = document.presentation.composition
  const remembered = document.presentation.phoneOrientation
    ?? (previous?.frame.kind === 'phone' ? previous.frame.orientation : undefined)
  const after = { ...document.presentation }
  if (!composition) {
    delete after.composition
    return { ...after, ...(remembered ? { phoneOrientation: remembered } : {}) }
  }
  if (composition.frame.kind !== 'phone') {
    return { ...after, composition, ...(remembered ? { phoneOrientation: remembered } : {}) }
  }
  const source = document.crop ?? document.canvas
  const orientation = automaticPhoneOrientation && previous?.frame.kind !== 'phone'
    ? remembered ?? (source.width > source.height ? 'landscape' : 'portrait')
    : composition.frame.orientation
  return { ...after, phoneOrientation: orientation,
    composition: { ...composition, frame: { ...composition.frame, orientation } } }
}
