import type {
  Ref,
  ShallowRef,
} from 'vue'
import type {
  EditorDocumentV1,
  StrokeStyle,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../../contracts'
import type {
  TextFormattingPatch,
  TextToolDefaults,
} from '../../canvas/contracts'
import type { TextDraft } from '../text-schema'

export interface TextEffectsContext {
  readonly calloutStroke?: Ref<StrokeStyle>
  readonly configuringCallout?: () => boolean
  readonly props: ResolvedEditorShellProps
  readonly store: {
    readonly selectedLayerIds: readonly string[]
    readonly selectedLayerId: string | undefined
  }
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly textDefaults: ShallowRef<TextToolDefaults>
  readonly textFormatting: ShallowRef<TextFormattingPatch | undefined>
  readonly textDraft: Ref<TextDraft | undefined>
}
