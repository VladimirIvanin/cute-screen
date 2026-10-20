import {
  inject,
  provide,
  ref,
  type InjectionKey,
  type Ref,
} from 'vue'

export interface GradientEditingState {
  readonly mode: Ref<'size' | 'transition'>
  readonly stop: Ref<number>
}
const key: InjectionKey<GradientEditingState> = Symbol('gradient-editing')
export function provideGradientEditing(): void {
  provide(key, { mode: ref<'size' | 'transition'>('size'), stop: ref(0) })
}
export function useGradientEditing(): GradientEditingState {
  return inject(key, undefined) ?? { mode: ref<'size' | 'transition'>('size'), stop: ref(0) }
}
