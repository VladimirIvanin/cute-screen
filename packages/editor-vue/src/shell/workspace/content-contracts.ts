import type {
  Ref,
  ShallowRef,
} from 'vue'
import type { EditorDocumentV1 } from '@cute-screen/editor-renderer'
import type { ImageInsertionTarget } from '../../texture-fill'
import type { TextToolDefaults } from '../canvas/contracts'
import type { ResolvedEditorShellProps } from '../contracts'

export interface ContentControllerContext {
  readonly error: Ref<string | undefined>
  readonly feedback?: Ref<string | undefined>
  readonly locale?: () => 'ru' | 'en'
  readonly target?: () => ImageInsertionTarget | undefined
  readonly focus?: () => void
  readonly props: ResolvedEditorShellProps
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly contentImageImporting: Ref<boolean>
  readonly textureImages: Ref<ReadonlyMap<string, HTMLImageElement>>
  readonly textDefaults: ShallowRef<TextToolDefaults>
  readonly selectedLayerId: Ref<string | undefined>
  readonly rememberTextDefaults: (layer: import('@cute-screen/editor-renderer').LayerNode) => void
  readonly addLayer: (layer: import('@cute-screen/editor-renderer').LayerNode) => void
}
