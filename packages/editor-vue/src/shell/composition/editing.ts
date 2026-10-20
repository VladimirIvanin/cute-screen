import type {
  InjectionKey,
  Ref,
  ComputedRef,
  ShallowRef,
} from 'vue'
import type { CompositionSettings } from '@cute-screen/editor-renderer'
export interface CompositionEditing {
  readonly settings: ComputedRef<CompositionSettings | undefined>
  readonly preview: ShallowRef<CompositionSettings | undefined>
  readonly editing: Ref<boolean>
  readonly selectedBrand: Ref<string | undefined>
  readonly gradientTarget: Ref<'background' | 'header' | 'footer'>
  readonly disabled: ComputedRef<boolean>
  commit(value: CompositionSettings): void
  showPreview(value: CompositionSettings): void
  cancel(): void
}
export const compositionEditingKey: InjectionKey<CompositionEditing> = Symbol('card-editing')
