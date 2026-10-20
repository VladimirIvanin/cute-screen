import type {
  InjectionKey,
  Ref,
} from 'vue'

export const compositionImagesKey: InjectionKey<{
  images: Readonly<Ref<ReadonlyMap<string, HTMLImageElement>>>
  error: Readonly<Ref<string | undefined>>
}> = Symbol('composition-images')
