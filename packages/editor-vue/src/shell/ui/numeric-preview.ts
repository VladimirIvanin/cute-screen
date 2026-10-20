import type { InjectionKey } from 'vue'

export interface NumericPreviewTarget {
  readonly id: string
  readonly defaultsTool?: string | undefined
  readonly layerId?: string | undefined
}

export interface NumericPreviewService {
  activate?(owner: symbol): void
  isBlocked(): boolean
  register(owner: symbol, invalidated: () => void): () => void
  preview(owner: symbol, target: NumericPreviewTarget, value: string): void
  cancel(owner?: symbol): void
}

export const numericPreviewKey: InjectionKey<NumericPreviewService> = Symbol('numeric-preview')
export const numericDefaultsKey: InjectionKey<() => string | undefined> = Symbol('numeric-defaults')

export const numericLocaleKey: InjectionKey<() => 'en' | 'ru'> = Symbol('numeric-locale')
export const numericContextKey: InjectionKey<() => string> = Symbol('numeric-context')
